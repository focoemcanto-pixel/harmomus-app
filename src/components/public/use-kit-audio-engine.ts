"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveFastAudioUrl } from "@/lib/audio/fast-audio-url";
import { getPitchEngine, type PitchPlaybackController } from "@/lib/audio/pitch-engine";

export interface KitTrack {
  src: string;
  title: string;
  semitoneShift?: number;
  trackId?: string;
  mediaTitle?: string;
  mediaArtist?: string;
  mediaAlbum?: string;
  artworkUrl?: string | null;
}

function normalizeTrackSource(track: KitTrack): KitTrack {
  return { ...track, src: resolveFastAudioUrl(track.src) };
}

function getTrackIdentity(track: KitTrack | null | undefined) {
  if (!track) return "";
  const src = resolveFastAudioUrl(track.src);
  return [track.trackId ?? src, src, track.title, String(track.semitoneShift ?? 0)].join("::");
}

function createAudioElement(preload: "metadata" | "auto") {
  const audio = new Audio();
  audio.preload = preload;
  audio.setAttribute("playsinline", "true");
  return audio;
}

function stopAudioElement(audio: HTMLAudioElement | null | undefined, options: { resetTime?: boolean; clearSource?: boolean } = {}) {
  if (!audio) return;
  try { audio.pause(); } catch {}
  if (options.resetTime !== false) {
    try { audio.currentTime = 0; } catch {}
  }
  if (options.clearSource) {
    try { audio.removeAttribute("src"); } catch {}
    try { audio.load(); } catch {}
  }
}

function normalizePlaybackError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/play\(\) request was interrupted|aborted/i.test(message)) return null;
  return message || "Não foi possível reproduzir este áudio agora.";
}

function artworkFromTrack(track: KitTrack) {
  const src = track.artworkUrl?.trim();
  if (!src) return undefined;
  return [
    { src, sizes: "96x96", type: "image/jpeg" },
    { src, sizes: "256x256", type: "image/jpeg" },
    { src, sizes: "512x512", type: "image/jpeg" },
  ];
}

function updateMediaSessionMetadata(track: KitTrack) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.mediaTitle || track.title || "Harmomus",
      artist: track.mediaArtist || "Harmomus",
      album: track.mediaAlbum || "Harmomus",
      artwork: artworkFromTrack(track),
    });
  } catch (error) {
    console.warn("[HarmomusPlayer] Could not update media session metadata", error);
  }
}

function setMediaSessionActionHandlers(actions: { play?: () => void; pause?: () => void; seekbackward?: () => void; seekforward?: () => void }) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try { navigator.mediaSession.setActionHandler("play", actions.play ?? null); } catch {}
  try { navigator.mediaSession.setActionHandler("pause", actions.pause ?? null); } catch {}
  try { navigator.mediaSession.setActionHandler("seekbackward", actions.seekbackward ?? null); } catch {}
  try { navigator.mediaSession.setActionHandler("seekforward", actions.seekforward ?? null); } catch {}
}

export function useKitAudioEngine() {
  const [track, setTrack] = useState<KitTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
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
  const requestSerialRef = useRef(0);
  const volumeRef = useRef(1);
  const loopRef = useRef(false);

  const cancelRaf = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const syncAudioState = useCallback((audio: HTMLAudioElement) => {
    setCurrentTime(audio.currentTime || 0);
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    setIsPlaying(!audio.paused && !audio.ended);
  }, []);

  const startRafLoop = useCallback((serial: number) => {
    cancelRaf();
    const update = () => {
      const audio = audioRef.current;
      if (!audio || requestSerialRef.current !== serial) return;
      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      rafIdRef.current = requestAnimationFrame(update);
    };
    rafIdRef.current = requestAnimationFrame(update);
  }, [cancelRaf]);

  const stopPlayback = useCallback(() => {
    requestSerialRef.current += 1;
    cancelRaf();
    try { pitchControllerRef.current?.dispose(); } catch {}
    pitchControllerRef.current = null;
    stopAudioElement(audioRef.current, { resetTime: true });
    stopAudioElement(preloaderRef.current, { resetTime: true });
    setIsPlaying(false);
    setIsPreparing(false);
    setCurrentTime(0);
    setDuration(0);
    setErrorMessage(null);
    setTrack(null);
    trackRef.current = null;
  }, [cancelRaf]);

  const disposePlaybackSession = useCallback(async () => {
    stopPlayback();
    stopAudioElement(audioRef.current, { resetTime: true, clearSource: true });
    stopAudioElement(preloaderRef.current, { resetTime: true, clearSource: true });
    audioRef.current = null;
    preloaderRef.current = null;
  }, [stopPlayback]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudioElement("auto");
    audioRef.current.volume = volumeRef.current;
    audioRef.current.loop = loopRef.current;
    return audioRef.current;
  }, []);

  const preloadTrack = useCallback((nextTrack: KitTrack, mode: "metadata" | "auto" = "auto") => {
    const fastTrack = normalizeTrackSource(nextTrack);
    if (!fastTrack.src || (fastTrack.semitoneShift ?? 0) !== 0) return;
    const audio = preloaderRef.current ?? createAudioElement(mode);
    preloaderRef.current = audio;
    audio.preload = mode;
    if (audio.src !== fastTrack.src) audio.src = fastTrack.src;
    try { audio.load(); } catch {}
  }, []);

  const playTrack = useCallback(async (nextTrack: KitTrack) => {
    const fastTrack = normalizeTrackSource(nextTrack);
    if (!fastTrack.src) return;

    const serial = requestSerialRef.current + 1;
    requestSerialRef.current = serial;
    cancelRaf();
    setIsPreparing(true);
    setIsPlaying(false);
    setErrorMessage(null);

    try { pitchControllerRef.current?.dispose(); } catch {}
    pitchControllerRef.current = null;
    stopAudioElement(audioRef.current, { resetTime: true });

    const audio = ensureAudio();
    audio.src = fastTrack.src;
    audio.volume = volumeRef.current;
    audio.loop = loopRef.current;
    audio.onloadedmetadata = () => syncAudioState(audio);
    audio.ondurationchange = () => syncAudioState(audio);
    audio.ontimeupdate = () => syncAudioState(audio);
    audio.onended = () => {
      if (requestSerialRef.current !== serial) return;
      setIsPlaying(false);
      setIsPreparing(false);
      syncAudioState(audio);
    };
    audio.onpause = () => {
      if (requestSerialRef.current !== serial) return;
      syncAudioState(audio);
    };
    audio.onplaying = () => {
      if (requestSerialRef.current !== serial) return;
      setIsPreparing(false);
      setIsPlaying(true);
      syncAudioState(audio);
    };

    setTrack(fastTrack);
    trackRef.current = fastTrack;
    updateMediaSessionMetadata(fastTrack);

    setMediaSessionActionHandlers({
      play: () => {
        const currentAudio = audioRef.current;
        if (!currentAudio) return;
        void (async () => {
          try {
            setIsPreparing(true);
            if (pitchControllerRef.current) await pitchControllerRef.current.play();
            else await currentAudio.play();
            setIsPreparing(false);
            setIsPlaying(true);
            syncAudioState(currentAudio);
            startRafLoop(requestSerialRef.current);
          } catch (error) {
            setIsPreparing(false);
            setIsPlaying(false);
            setErrorMessage(normalizePlaybackError(error));
          }
        })();
      },
      pause: () => {
        try { pitchControllerRef.current?.pause(); } catch {}
        stopAudioElement(audioRef.current, { resetTime: false });
        cancelRaf();
        setIsPlaying(false);
        setIsPreparing(false);
      },
      seekbackward: () => {
        const currentAudio = audioRef.current;
        if (currentAudio) currentAudio.currentTime = Math.max(0, currentAudio.currentTime - 10);
      },
      seekforward: () => {
        const currentAudio = audioRef.current;
        if (currentAudio) currentAudio.currentTime = currentAudio.currentTime + 10;
      },
    });

    try {
      const shift = fastTrack.semitoneShift ?? 0;
      if (shift === 0) {
        await audio.play();
      } else {
        const pitchController = await getPitchEngine().createPlayback({ audio, semitoneShift: shift });
        if (requestSerialRef.current !== serial) {
          pitchController.dispose();
          return;
        }
        pitchControllerRef.current = pitchController;
        await pitchController.play();
      }

      if (requestSerialRef.current !== serial) return;
      setIsPreparing(false);
      setIsPlaying(true);
      syncAudioState(audio);
      startRafLoop(serial);
    } catch (error) {
      if (requestSerialRef.current !== serial) return;
      setIsPreparing(false);
      setIsPlaying(false);
      setErrorMessage(normalizePlaybackError(error));
    }
  }, [cancelRaf, ensureAudio, startRafLoop, syncAudioState]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;

    if (isPlaying) {
      try { pitchControllerRef.current?.pause(); } catch {}
      stopAudioElement(audio, { resetTime: false });
      cancelRaf();
      setIsPlaying(false);
      setIsPreparing(false);
      return;
    }

    setIsPreparing(true);
    setErrorMessage(null);
    try {
      if (pitchControllerRef.current) await pitchControllerRef.current.play();
      else await audio.play();
      setIsPreparing(false);
      setIsPlaying(true);
      syncAudioState(audio);
      startRafLoop(requestSerialRef.current);
    } catch (error) {
      setIsPreparing(false);
      setIsPlaying(false);
      setErrorMessage(normalizePlaybackError(error));
    }
  }, [cancelRaf, isPlaying, startRafLoop, syncAudioState]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
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
    if (preloaderRef.current) preloaderRef.current.volume = next;
  }, []);

  const setLoopValue = useCallback((value: boolean) => {
    loopRef.current = value;
    setLoop(value);
    if (audioRef.current) audioRef.current.loop = value;
  }, []);

  useEffect(() => {
    ensureAudio();
    return () => {
      void disposePlaybackSession();
    };
  }, [disposePlaybackSession, ensureAudio]);

  return {
    audioRef,
    preloaderRef,
    track,
    isPlaying,
    isPreparing,
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
    stopPlayback,
    disposePlaybackSession,
    isCurrentTrack: (trackToCheck: KitTrack) => getTrackIdentity(trackRef.current) === getTrackIdentity(trackToCheck),
  };
}
