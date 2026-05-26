"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getPitchEngine, type PitchPlaybackController } from "@/lib/audio/pitch-engine";

export interface KitTrack {
  src: string;
  title: string;
  semitoneShift?: number;
  trackId?: string;
}

function getTrackIdentity(track: KitTrack | null | undefined) {
  if (!track) return "";
  return [track.trackId ?? track.src, track.src, track.title, String(track.semitoneShift ?? 0)].join("::");
}

function createAudioElement(preload: "metadata" | "auto") {
  const audio = new Audio();
  audio.preload = preload;
  audio.crossOrigin = "anonymous";
  audio.setAttribute("playsinline", "true");
  return audio;
}

export function useKitAudioEngine() {
  const [track, setTrack] = useState<KitTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trackRef = useRef<KitTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloaderRef = useRef<HTMLAudioElement | null>(null);
  const pitchControllerRef = useRef<PitchPlaybackController | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeIdentityRef = useRef<string>("");
  const transitionLockRef = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);
  const volumeRef = useRef(1);
  const loopRef = useRef(false);
  const requestSerialRef = useRef(0);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudioElement("metadata");
    if (!preloaderRef.current) preloaderRef.current = createAudioElement("auto");
    audioRef.current.volume = volumeRef.current;
    audioRef.current.loop = loopRef.current;
    return audioRef.current;
  }, []);

  const cancelRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const hardInvalidatePlayback = useCallback(() => {
    requestSerialRef.current += 1;
    sessionIdRef.current = null;
    activeIdentityRef.current = "";

    abortRef.current?.abort("hard-invalidate");
    abortRef.current = null;

    cancelRaf();

    try { pitchControllerRef.current?.dispose(); } catch {}
    pitchControllerRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      try { audio.pause(); } catch {}
      try { audio.currentTime = 0; } catch {}
      audio.removeAttribute("src");
      audio.src = "";
      try { audio.load(); } catch {}
    }

    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setErrorMessage(null);
    setTrack(null);
    trackRef.current = null;
  }, [cancelRaf]);

  const disposePlaybackSession = useCallback(async () => {
    hardInvalidatePlayback();

    const preloader = preloaderRef.current;
    if (preloader) {
      try { preloader.pause(); } catch {}
      preloader.removeAttribute("src");
      preloader.src = "";
      try { preloader.load(); } catch {}
    }
  }, [hardInvalidatePlayback]);

  const runTransition = useCallback(async (operation: () => Promise<void>) => {
    const queued = transitionLockRef.current.catch(() => undefined).then(operation);
    transitionLockRef.current = queued.catch(() => undefined);
    await queued;
  }, []);

  const startRafLoop = useCallback((sessionId: string, requestSerial: number, identity: string) => {
    cancelRaf();
    const update = () => {
      const audio = audioRef.current;
      if (!audio || sessionIdRef.current !== sessionId || requestSerialRef.current !== requestSerial || activeIdentityRef.current !== identity) return;
      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      rafIdRef.current = requestAnimationFrame(update);
    };
    rafIdRef.current = requestAnimationFrame(update);
  }, [cancelRaf]);

  const playTrack = useCallback(async (nextTrack: KitTrack) => {
    if (!nextTrack.src) return;

    const identity = getTrackIdentity(nextTrack);
    hardInvalidatePlayback();
    const requestSerial = requestSerialRef.current;

    await runTransition(async () => {
      if (requestSerialRef.current !== requestSerial) return;

      const audio = ensureAudio();
      const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionIdRef.current = sessionId;
      activeIdentityRef.current = identity;
      setErrorMessage(null);
      setTrack(nextTrack);
      trackRef.current = nextTrack;

      const abortController = new AbortController();
      abortRef.current = abortController;

      audio.src = nextTrack.src;
      audio.volume = volumeRef.current;
      audio.loop = loopRef.current;
      audio.load();

      const isStillCurrent = () => (
        !abortController.signal.aborted &&
        sessionIdRef.current === sessionId &&
        requestSerialRef.current === requestSerial &&
        activeIdentityRef.current === identity &&
        getTrackIdentity(trackRef.current) === identity
      );

      try {
        const shift = nextTrack.semitoneShift ?? 0;
        if (shift === 0) {
          if (!isStillCurrent()) return;
          await audio.play();
        } else {
          if (!isStillCurrent()) return;
          const pitchController = await getPitchEngine().createPlayback({ audio, semitoneShift: shift, signal: abortController.signal });
          if (!isStillCurrent()) {
            pitchController.dispose();
            return;
          }
          pitchControllerRef.current = pitchController;
          await pitchController.play();
        }

        if (!isStillCurrent()) return;
        setIsPlaying(true);
        startRafLoop(sessionId, requestSerial, identity);
      } catch (error) {
        if (!isStillCurrent()) return;
        setIsPlaying(false);
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível reproduzir este áudio agora.");
      }
    });
  }, [ensureAudio, hardInvalidatePlayback, runTransition, startRafLoop]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;

    if (isPlaying) {
      abortRef.current?.abort("pause");
      try { pitchControllerRef.current?.pause(); } catch {}
      audio.pause();
      setIsPlaying(false);
      return;
    }

    await playTrack(trackRef.current);
  }, [isPlaying, playTrack]);

  const preloadTrack = useCallback((nextTrack: KitTrack) => {
    if ((nextTrack.semitoneShift ?? 0) !== 0 || !nextTrack.src) return;
    if (!preloaderRef.current) preloaderRef.current = createAudioElement("auto");
    preloaderRef.current.src = nextTrack.src;
    preloaderRef.current.load();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    const sessionId = sessionIdRef.current;
    if (!audio || !sessionId) return;
    const next = Math.max(0, Math.min(seconds, Number.isFinite(audio.duration) ? audio.duration : seconds));
    audio.currentTime = next;
    setCurrentTime(next);
  }, []);

  const skipBy = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    seekTo(audio.currentTime + seconds);
  }, [seekTo]);

  const setVolumeValue = useCallback((value: number) => {
    const next = Math.max(0, Math.min(value, 1));
    volumeRef.current = next;
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
  }, []);

  const setLoopValue = useCallback((value: boolean) => {
    loopRef.current = value;
    setLoop(value);
    if (audioRef.current) audioRef.current.loop = value;
  }, []);

  useEffect(() => {
    ensureAudio();
    return () => {
      hardInvalidatePlayback();
      void runTransition(disposePlaybackSession);
    };
  }, [disposePlaybackSession, ensureAudio, hardInvalidatePlayback, runTransition]);

  return {
    audioRef,
    preloaderRef,
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    loop,
    errorMessage,
    preloadTrack,
    playTrack,
    togglePlay,
    seekTo,
    skipBy,
    setVolumeValue,
    setLoopValue,
    stopPlayback: hardInvalidatePlayback,
    disposePlaybackSession: () => runTransition(disposePlaybackSession),
    isCurrentTrack: (trackToCheck: KitTrack) => getTrackIdentity(trackRef.current) === getTrackIdentity(trackToCheck),
  };
}
