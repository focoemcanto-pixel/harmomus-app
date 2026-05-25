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
  try { window.localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ volume, loop })); } catch {}
}

function getTrackIdentity(track: GlobalTrack | null) {
  if (!track) return null;
  const shift = track.semitoneShift ?? 0;
  const trackId = track.trackId ?? "unknown-track";
  const src = track.src ?? "unknown-src";
  const title = track.title ?? "unknown-title";
  const voice = track.voice ?? "todos";
  const tone = track.tone ?? "unknown";
  return `${trackId}-${src}-${title}-${voice}-${tone}-${shift}`;
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
  const activePlaybackKeyRef = useRef<string | null>(null);
  const currentPlaybackAbortControllerRef = useRef<AbortController | null>(null);
  const transitionLockRef = useRef(false);

  const [track, setTrack] = useState<GlobalTrack | null>(null);
  const trackRef = useRef<GlobalTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preloadedSrc, setPreloadedSrc] = useState<string | null>(null);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  function logDev(message: string, extra?: Record<string, unknown>) {
    if (!isDev) return;
    console.info(`[GlobalAudioPlayer] ${message}`, {
      sessionId: currentPlaybackSessionIdRef.current,
      activePitchController: Boolean(pitchControllerRef.current),
      voice: track?.voice ?? null,
      tone: track?.tone ?? null,
      shift: track?.semitoneShift ?? 0,
      activePlaybackKey: activePlaybackKeyRef.current,
      identity: getTrackIdentity(trackRef.current),
      ...extra,
    });
  }

  async function fullyDisposeEngine() {
    const audio = audioRef.current;
    const preloadAudio = preloadAudioRef.current;

    try { pitchControllerRef.current?.dispose(); } catch {}
    pitchControllerRef.current = null;

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.src = "";
      audio.load();
    }

    if (preloadAudio) {
      preloadAudio.pause();
      preloadAudio.removeAttribute("src");
      preloadAudio.src = "";
      preloadAudio.load();
    }

    activePlaybackKeyRef.current = null;
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
    setLoop(prefs.loop);
    if (audioRef.current) {
      audioRef.current.volume = prefs.volume;
      audioRef.current.loop = prefs.loop;
    }
  }, []);

  useEffect(() => {
    return () => { void invalidateCurrentPlayback("unmount"); };
  }, []);

  function preloadTrack(nextTrack: GlobalTrack) {
    const currentTrack = trackRef.current;
    if (!nextTrack.src || isSameTrack(currentTrack, nextTrack) || preloadedSrc === nextTrack.src) return;
    if ((nextTrack.semitoneShift ?? 0) !== 0) return;
    const preloadAudio = preloadAudioRef.current;
    if (!preloadAudio) return;
    try {
      preloadAudio.src = nextTrack.src;
      preloadAudio.load();
      setPreloadedSrc(nextTrack.src);
    } catch {
      setPreloadedSrc(null);
    }
  }

  async function playTrack(nextTrack: GlobalTrack) {
    if (transitionLockRef.current) return;
    transitionLockRef.current = true;
    const audio = audioRef.current;
    if (!audio) { transitionLockRef.current = false; return; }

    const semitoneShift = nextTrack.semitoneShift ?? 0;

    try {
      setErrorMessage(null);
      setHasEnded(false);

      const identity = getTrackIdentity(nextTrack);
      const cacheKey = identity ?? `${nextTrack.trackId ?? nextTrack.src}-${nextTrack.voice ?? "todos"}-${nextTrack.tone ?? "unknown"}-${semitoneShift}`;
      const sourceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const currentTrack = trackRef.current;
      if (!isSameTrack(currentTrack, nextTrack)) {
        await invalidateCurrentPlayback("track-change");
        setTrack(nextTrack);
        trackRef.current = nextTrack;
        setPreloadedSrc(null);
        activePlaybackKeyRef.current = cacheKey;
        logDev("building fresh playback pipeline", {
          voice: nextTrack.voice ?? null,
          tone: nextTrack.tone ?? null,
          shift: semitoneShift,
          cacheKey,
          sourceId,
          identity,
          sessionId: currentPlaybackSessionIdRef.current,
        });
        setCurrentTime(0);
        setDuration(0);
        audio.src = nextTrack.src;
        audio.load();
      }

      const newController = new AbortController();
      currentPlaybackAbortControllerRef.current = newController;
      const sessionId = currentPlaybackSessionIdRef.current;
      audio.volume = volume;
      audio.loop = loop;

      if (semitoneShift === 0) {
        await audio.play();
      } else {
        const controller = await getPitchEngine().createPlayback({ audio, semitoneShift, signal: newController.signal });
        if (newController.signal.aborted || sessionId !== currentPlaybackSessionIdRef.current) {
          controller.dispose();
          return;
        }
        pitchControllerRef.current = controller;
        await controller.play();
      }

      setIsPlaying(true);
      logDev("source loaded", {
        src: nextTrack.src,
        semitoneShift,
        cacheKey,
        sourceId,
        identity,
        voice: nextTrack.voice ?? null,
        tone: nextTrack.tone ?? null,
        shift: semitoneShift,
        sessionId: currentPlaybackSessionIdRef.current,
      });
    } catch (error) {
      setErrorMessage("Não foi possível reproduzir este áudio agora.");
      setIsPlaying(false);
      logDev("playback error", { error: String(error) });
    } finally {
      transitionLockRef.current = false;
    }
  }

  async function togglePlay() { if (!audioRef.current || !track?.src) return; if (isPlaying) { pitchControllerRef.current?.pause(); audioRef.current.pause(); setIsPlaying(false); return; } await playTrack(track); }
  async function replay() { if (!track) return; await playTrack(track); }
  function seekTo(seconds: number) { const audio = audioRef.current; if (!audio) return; if ((track?.semitoneShift ?? 0) !== 0) { setErrorMessage("Busca manual ainda não está disponível em áudio modulado."); return; } const next = Math.max(0, Math.min(seconds, duration || seconds)); audio.currentTime = next; setCurrentTime(next); if (hasEnded && next < duration) setHasEnded(false); }
  function skipBy(seconds: number) { const audio = audioRef.current; if (!audio) return; seekTo(audio.currentTime + seconds); }
  function setVolumeValue(value: number) { const next = Math.max(0, Math.min(value, 1)); setVolume(next); if (audioRef.current) audioRef.current.volume = next; storePreferences(next, loop); }
  function setLoopValue(value: boolean) { setLoop(value); if (audioRef.current) audioRef.current.loop = value; storePreferences(volume, value); }
  async function closePlayer() { await invalidateCurrentPlayback("close-player"); trackRef.current = null; setTrack(null); setCurrentTime(0); setDuration(0); setHasEnded(false); setErrorMessage(null); }

  const value = useMemo<GlobalAudioPlayerContextValue>(() => ({ audioRef, track, isPlaying, currentTime, duration, volume, loop, hasEnded, errorMessage, preloadedSrc, preloadTrack, playTrack, togglePlay, replay, seekTo, skipBy, setVolumeValue, setLoopValue, closePlayer }), [track, isPlaying, currentTime, duration, volume, loop, hasEnded, errorMessage, preloadedSrc]);

  return <GlobalAudioPlayerContext.Provider value={value}>{children}<audio ref={audioRef} preload="metadata" onTimeUpdate={(e)=>setCurrentTime(e.currentTarget.currentTime)} onLoadedMetadata={(e)=>setDuration(e.currentTarget.duration||0)} onPause={()=>setIsPlaying(false)} onPlay={()=>setIsPlaying(true)} onEnded={()=>{setIsPlaying(false); if(!loop) setHasEnded(true);}} onError={()=>setErrorMessage("Áudio indisponível ou acesso negado.")} className="hidden"/><audio ref={preloadAudioRef} preload="auto" className="hidden" aria-hidden="true"/></GlobalAudioPlayerContext.Provider>;
}

export function useGlobalAudioPlayer() {
  const context = useContext(GlobalAudioPlayerContext);
  if (!context) throw new Error("useGlobalAudioPlayer deve ser usado dentro de GlobalAudioPlayerProvider.");
  return context;
}
