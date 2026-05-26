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
  const transitionLockRef = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);

  const cancelRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const disposePlaybackSession = useCallback(async () => {
    const disposeSessionId = sessionIdRef.current;
    sessionIdRef.current = null;

    abortRef.current?.abort("dispose");
    abortRef.current = null;

    cancelRaf();

    try {
      pitchControllerRef.current?.dispose();
    } catch {}
    pitchControllerRef.current = null;

    const audio = audioRef.current;
    if (audio) {
      try { audio.pause(); } catch {}
      try { audio.currentTime = 0; } catch {}
      audio.removeAttribute("src");
      audio.src = "";
      try { audio.load(); } catch {}
    }

    const preloader = preloaderRef.current;
    if (preloader) {
      try { preloader.pause(); } catch {}
      preloader.removeAttribute("src");
      preloader.src = "";
      try { preloader.load(); } catch {}
    }

    if (!disposeSessionId || disposeSessionId === sessionIdRef.current) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setErrorMessage(null);
      setTrack(null);
      trackRef.current = null;
    }
  }, [cancelRaf]);

  const runTransition = useCallback(async (operation: () => Promise<void>) => {
    const queued = transitionLockRef.current.catch(() => undefined).then(operation);
    transitionLockRef.current = queued.catch(() => undefined);
    await queued;
  }, []);

  const startRafLoop = useCallback((sessionId: string) => {
    cancelRaf();
    const update = () => {
      const audio = audioRef.current;
      if (!audio || sessionIdRef.current !== sessionId) return;
      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      rafIdRef.current = requestAnimationFrame(update);
    };
    rafIdRef.current = requestAnimationFrame(update);
  }, [cancelRaf]);

  const playTrack = useCallback(async (nextTrack: KitTrack) => {
    await runTransition(async () => {
      await disposePlaybackSession();

      const audio = audioRef.current;
      if (!audio?.src && !nextTrack.src) return;

      const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionIdRef.current = sessionId;
      setErrorMessage(null);
      setTrack(nextTrack);
      trackRef.current = nextTrack;

      const abortController = new AbortController();
      abortRef.current = abortController;

      audio!.src = nextTrack.src;
      audio!.volume = volume;
      audio!.loop = loop;
      audio!.load();

      try {
        const shift = nextTrack.semitoneShift ?? 0;
        if (shift === 0) {
          await audio!.play();
        } else {
          const pitchController = await getPitchEngine().createPlayback({ audio: audio!, semitoneShift: shift, signal: abortController.signal });
          if (abortController.signal.aborted || sessionIdRef.current !== sessionId) {
            pitchController.dispose();
            return;
          }
          pitchControllerRef.current = pitchController;
          await pitchController.play();
        }

        if (abortController.signal.aborted || sessionIdRef.current !== sessionId) return;
        setIsPlaying(true);
        startRafLoop(sessionId);
      } catch (error) {
        if (sessionIdRef.current !== sessionId) return;
        setIsPlaying(false);
        setErrorMessage(error instanceof Error ? error.message : "Não foi possível reproduzir este áudio agora.");
      }
    });
  }, [disposePlaybackSession, loop, runTransition, startRafLoop, volume]);

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
    if (!preloaderRef.current || (nextTrack.semitoneShift ?? 0) !== 0 || !nextTrack.src) return;
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

  useEffect(() => {
    return () => {
      void runTransition(disposePlaybackSession);
    };
  }, [disposePlaybackSession, runTransition]);

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
    setVolumeValue: setVolume,
    setLoopValue: setLoop,
    stopPlayback: () => void runTransition(disposePlaybackSession),
    disposePlaybackSession: () => runTransition(disposePlaybackSession),
    isCurrentTrack: (trackToCheck: KitTrack) => getTrackIdentity(trackRef.current) === getTrackIdentity(trackToCheck),
  };
}
