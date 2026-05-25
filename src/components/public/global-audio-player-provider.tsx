"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getPitchEngine, type PitchPlaybackController } from "@/lib/audio/pitch-engine";

export type GlobalTrack = {
  src: string;
  title: string;
  semitoneShift?: number;
  trackId?: string;
  voice?: string;
  tone?: string;
};

type GlobalAudioPlayerContextValue = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  track: GlobalTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  loop: boolean;
  hasEnded: boolean;
  errorMessage: string | null;
  preloadedSrc: string | null;
  preloadTrack: (track: GlobalTrack) => void;
  playTrack: (track: GlobalTrack) => Promise<void>;
  togglePlay: () => Promise<void>;
  replay: () => Promise<void>;
  seekTo: (seconds: number) => void;
  skipBy: (seconds: number) => void;
  setVolumeValue: (value: number) => void;
  setLoopValue: (value: boolean) => void;
  closePlayer: () => Promise<void>;
};

const GlobalAudioPlayerContext = createContext<GlobalAudioPlayerContextValue | null>(null);
const PLAYER_PREFS_KEY = "harmomus-player-preferences";

function readStoredPreferences() {
  if (typeof window === "undefined") return { volume: 1, loop: false };
  try {
    const raw = window.localStorage.getItem(PLAYER_PREFS_KEY);
    if (!raw) return { volume: 1, loop: false };
    const parsed = JSON.parse(raw) as { volume?: number; loop?: boolean };
    return { volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(parsed.volume, 1)) : 1, loop: Boolean(parsed.loop) };
  } catch {
    return { volume: 1, loop: false };
  }
}

function storePreferences(volume: number, loop: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ volume, loop }));
  } catch {}
}

function getTrackIdentity(track: GlobalTrack | null | undefined) {
  if (!track) return "";
  return [
    track.trackId || track.src,
    track.src,
    track.title,
    track.voice ?? "todos",
    track.tone ?? "unknown",
    String(track.semitoneShift ?? 0),
  ].join("::");
}

function isSameTrack(a: GlobalTrack | null, b: GlobalTrack) {
  return getTrackIdentity(a) === getTrackIdentity(b);
}

const isDev = process.env.NODE_ENV === "development";

export function GlobalAudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const pitchControllerRef = useRef<PitchPlaybackController | null>(null);
  const currentPlaybackSessionIdRef = useRef(0);
  const currentPlaybackAbortControllerRef = useRef<AbortController | null>(null);
  const activePlaybackKeyRef = useRef<string | null>(null);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestPlayRequestIdRef = useRef(0);

  const [track, setTrack] = useState<GlobalTrack | null>(null);
  const trackRef = useRef<GlobalTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preloadedSrc, setPreloadedSrc] = useState<string | null>(null);

  function setActiveTrack(nextTrack: GlobalTrack | null) {
    trackRef.current = nextTrack;
    setTrack(nextTrack);
  }

  function enqueueOperation(operation: () => Promise<void>) {
    const next = operationQueueRef.current.catch(() => undefined).then(operation);
    operationQueueRef.current = next.catch(() => undefined);
    return next;
  }

  function logDev(message: string, extra?: Record<string, unknown>) {
    if (!isDev) return;
    console.info(`[GlobalAudioPlayer] ${message}`, {
      sessionId: currentPlaybackSessionIdRef.current,
      activePitchController: Boolean(pitchControllerRef.current),
      activePlaybackKey: activePlaybackKeyRef.current,
      identity: getTrackIdentity(trackRef.current),
      voice: trackRef.current?.voice ?? null,
      tone: trackRef.current?.tone ?? null,
      shift: trackRef.current?.semitoneShift ?? 0,
      ...extra,
    });
  }

  async function fullyDisposeEngine() {
    const audio = audioRef.current;
    const preloadAudio = preloadAudioRef.current;

    try {
      pitchControllerRef.current?.dispose();
    } catch {}
    pitchControllerRef.current = null;

    if (audio) {
      try {
        audio.pause();
      } catch {}
      audio.removeAttribute("src");
      audio.src = "";
      try {
        audio.load();
      } catch {}
    }

    if (preloadAudio) {
      try {
        preloadAudio.pause();
      } catch {}
      preloadAudio.removeAttribute("src");
      preloadAudio.src = "";
      try {
        preloadAudio.load();
      } catch {}
    }

    activePlaybackKeyRef.current = null;
    setPreloadedSrc(null);
    setIsPlaying(false);
    logDev("engine cleanup complete");
  }

  async function invalidateCurrentPlayback(reason: string) {
    currentPlaybackSessionIdRef.current += 1;
    currentPlaybackAbortControllerRef.current?.abort(`${reason}::abort`);
    currentPlaybackAbortControllerRef.current = null;
    logDev("aborting previous playback", { reason });
    await fullyDisposeEngine();
  }

  useEffect(() => {
    const prefs = readStoredPreferences();
    setVolume(prefs.volume);
    volumeRef.current = prefs.volume;
    setLoop(prefs.loop);
    loopRef.current = prefs.loop;
    if (audioRef.current) {
      audioRef.current.volume = prefs.volume;
      audioRef.current.loop = prefs.loop;
    }
  }, []);

  useEffect(() => {
    return () => {
      void enqueueOperation(async () => {
        await invalidateCurrentPlayback("unmount");
      });
    };
  }, []);

  function preloadTrack(nextTrack: GlobalTrack) {
    const preloadKey = getTrackIdentity(nextTrack);
    if (!nextTrack.src || isSameTrack(trackRef.current, nextTrack) || preloadedSrc === preloadKey) return;
    if ((nextTrack.semitoneShift ?? 0) !== 0) return;

    const preloadAudio = preloadAudioRef.current;
    if (!preloadAudio) return;

    try {
      preloadAudio.src = nextTrack.src;
      preloadAudio.load();
      setPreloadedSrc(preloadKey);
    } catch {
      setPreloadedSrc(null);
    }
  }

  async function playTrack(nextTrack: GlobalTrack) {
    const requestId = ++latestPlayRequestIdRef.current;
    const targetIdentity = getTrackIdentity(nextTrack);

    return enqueueOperation(async () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (requestId !== latestPlayRequestIdRef.current) return;

      const semitoneShift = nextTrack.semitoneShift ?? 0;
      const sourceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      try {
        setErrorMessage(null);
        setHasEnded(false);

        await invalidateCurrentPlayback("track-change");
        if (requestId !== latestPlayRequestIdRef.current) return;

        setActiveTrack(nextTrack);
        activePlaybackKeyRef.current = targetIdentity;
        setCurrentTime(0);
        setDuration(0);

        audio.src = nextTrack.src;
        audio.volume = volumeRef.current;
        audio.loop = loopRef.current;
        audio.load();

        const abortController = new AbortController();
        currentPlaybackAbortControllerRef.current = abortController;
        const sessionId = currentPlaybackSessionIdRef.current;

        logDev("building fresh playback pipeline", {
          identity: targetIdentity,
          sourceId,
          voice: nextTrack.voice ?? null,
          tone: nextTrack.tone ?? null,
          shift: semitoneShift,
          sessionId,
        });

        if (semitoneShift === 0) {
          await audio.play();
        } else {
          const controller = await getPitchEngine().createPlayback({ audio, semitoneShift, signal: abortController.signal });
          if (abortController.signal.aborted || sessionId !== currentPlaybackSessionIdRef.current || requestId !== latestPlayRequestIdRef.current || targetIdentity !== getTrackIdentity(trackRef.current)) {
            controller.dispose();
            return;
          }
          pitchControllerRef.current = controller;
          await controller.play();
        }

        if (requestId !== latestPlayRequestIdRef.current || targetIdentity !== getTrackIdentity(trackRef.current)) return;
        setIsPlaying(true);
        logDev("source loaded", { identity: targetIdentity, sourceId, src: nextTrack.src, semitoneShift, sessionId });
      } catch (error) {
        if (requestId !== latestPlayRequestIdRef.current) return;
        setErrorMessage("Não foi possível reproduzir este áudio agora.");
        setIsPlaying(false);
        logDev("playback error", { error: String(error), identity: targetIdentity });
      }
    });
  }

  async function togglePlay() {
    const currentTrack = trackRef.current;
    const audio = audioRef.current;
    if (!audio || !currentTrack?.src) return;

    if (isPlaying) {
      currentPlaybackAbortControllerRef.current?.abort("pause::abort");
      try {
        pitchControllerRef.current?.pause();
      } catch {}
      audio.pause();
      setIsPlaying(false);
      return;
    }

    await playTrack(currentTrack);
  }

  async function replay() {
    const currentTrack = trackRef.current;
    if (!currentTrack) return;
    await playTrack(currentTrack);
  }

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    if ((trackRef.current?.semitoneShift ?? 0) !== 0) {
      setErrorMessage("Busca manual ainda não está disponível em áudio modulado.");
      return;
    }

    const next = Math.max(0, Math.min(seconds, duration || seconds));
    audio.currentTime = next;
    setCurrentTime(next);
    if (hasEnded && next < duration) setHasEnded(false);
  }

  function skipBy(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    seekTo(audio.currentTime + seconds);
  }

  function setVolumeValue(value: number) {
    const next = Math.max(0, Math.min(value, 1));
    setVolume(next);
    volumeRef.current = next;
    if (audioRef.current) audioRef.current.volume = next;
    storePreferences(next, loopRef.current);
  }

  function setLoopValue(value: boolean) {
    setLoop(value);
    loopRef.current = value;
    if (audioRef.current) audioRef.current.loop = value;
    storePreferences(volumeRef.current, value);
  }

  async function closePlayer() {
    latestPlayRequestIdRef.current += 1;
    return enqueueOperation(async () => {
      await invalidateCurrentPlayback("close-player");
      setActiveTrack(null);
      setCurrentTime(0);
      setDuration(0);
      setHasEnded(false);
      setErrorMessage(null);
    });
  }

  const value = useMemo<GlobalAudioPlayerContextValue>(() => ({
    audioRef,
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    loop,
    hasEnded,
    errorMessage,
    preloadedSrc,
    preloadTrack,
    playTrack,
    togglePlay,
    replay,
    seekTo,
    skipBy,
    setVolumeValue,
    setLoopValue,
    closePlayer,
  }), [track, isPlaying, currentTime, duration, volume, loop, hasEnded, errorMessage, preloadedSrc]);

  return (
    <GlobalAudioPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onEnded={() => {
          setIsPlaying(false);
          if (!loopRef.current) setHasEnded(true);
        }}
        onError={() => setErrorMessage("Áudio indisponível ou acesso negado.")}
        className="hidden"
      />
      <audio ref={preloadAudioRef} preload="auto" className="hidden" aria-hidden="true" />
    </GlobalAudioPlayerContext.Provider>
  );
}

export function useGlobalAudioPlayer() {
  const context = useContext(GlobalAudioPlayerContext);
  if (!context) throw new Error("useGlobalAudioPlayer deve ser usado dentro de GlobalAudioPlayerProvider.");
  return context;
}
