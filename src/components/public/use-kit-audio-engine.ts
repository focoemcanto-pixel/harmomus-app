"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function getTrackIdentity(track: KitTrack | null | undefined) {
  if (!track) return "";
  return [track.trackId ?? track.src, track.src, track.title, String(track.semitoneShift ?? 0)].join("::");
}

function createAudioElement(preload: "metadata" | "auto") {
  const audio = new Audio();
  audio.preload = preload;
  audio.setAttribute("playsinline", "true");
  return audio;
}

type PlaybackMetric = {
  id: string;
  src: string;
  clickAt: number;
  fetchStartAt?: number;
  fetchEndAt?: number;
  canplayAt?: number;
  playingAt?: number;
};

function nowPerf() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function logPlaybackMetric(metric: PlaybackMetric, event: "PLAY_CLICK" | "FETCH_AUDIO_START" | "FETCH_AUDIO_END" | "AUDIO_CANPLAY" | "AUDIO_PLAYING") {
  const fetchStartAt = metric.fetchStartAt ?? metric.clickAt;
  const fetchEndAt = metric.fetchEndAt ?? metric.canplayAt ?? metric.playingAt;
  const canplayAt = metric.canplayAt ?? metric.playingAt;
  const playingAt = metric.playingAt;
  console.info(`[HarmomusPlayer:perf] ${event}`, {
    id: metric.id,
    src: metric.src,
    clickToFetchMs: Math.round(fetchStartAt - metric.clickAt),
    fetchToResponseMs: fetchEndAt ? Math.round(fetchEndAt - fetchStartAt) : null,
    responseToCanplayMs: fetchEndAt && canplayAt ? Math.round(canplayAt - fetchEndAt) : null,
    canplayToPlayingMs: canplayAt && playingAt ? Math.round(playingAt - canplayAt) : null,
    totalMs: playingAt ? Math.round(playingAt - metric.clickAt) : null,
  });
}

function readResourceResponseEnd(src: string, fallback: number) {
  if (typeof performance === "undefined" || typeof performance.getEntriesByName !== "function") return fallback;
  const entries = performance.getEntriesByName(src, "resource") as PerformanceResourceTiming[];
  const latest = entries.at(-1);
  return latest?.responseEnd && latest.responseEnd > 0 ? latest.responseEnd : fallback;
}

function normalizePlaybackError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/operation is not supported|not supported source|no supported source|media resource/i.test(message)) {
    return "Não foi possível iniciar este áudio. Tente clicar novamente.";
  }
  if (/play\(\) request was interrupted|aborted/i.test(message)) return null;
  return message || "Não foi possível reproduzir este áudio agora.";
}

function normalizeArtworkSrc(value: unknown) {
  const src = String(value ?? "").trim();
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  if (typeof window !== "undefined" && src.startsWith("/")) return `${window.location.origin}${src}`;
  return src;
}

function artworkFromTrack(track: KitTrack) {
  const src = normalizeArtworkSrc(track.artworkUrl);
  if (!src) return undefined;

  // iOS Safari is picky with artwork metadata. Avoid forcing a MIME type because
  // kit covers may be jpg, png, webp or transformed by Cloudflare/R2.
  return [
    { src, sizes: "512x512" },
    { src, sizes: "256x256" },
    { src, sizes: "96x96" },
  ];
}

function setPlaybackState(state: MediaSessionPlaybackState) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {}
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

function setMediaSessionActionHandlers(actions: {
  play?: () => void;
  pause?: () => void;
  seekbackward?: () => void;
  seekforward?: () => void;
}) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

  try { navigator.mediaSession.setActionHandler("play", actions.play ?? null); } catch {}
  try { navigator.mediaSession.setActionHandler("pause", actions.pause ?? null); } catch {}
  try { navigator.mediaSession.setActionHandler("seekbackward", actions.seekbackward ?? null); } catch {}
  try { navigator.mediaSession.setActionHandler("seekforward", actions.seekforward ?? null); } catch {}
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
  const preloadedSrcRef = useRef<string | null>(null);
  const pitchControllerRef = useRef<PitchPlaybackController | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const activeIdentityRef = useRef<string>("");
  const transitionLockRef = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);
  const volumeRef = useRef(1);
  const loopRef = useRef(false);
  const requestSerialRef = useRef(0);
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const playbackMetricRef = useRef<PlaybackMetric | null>(null);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudioElement("auto");
    if (!preloaderRef.current) preloaderRef.current = createAudioElement("auto");
    audioRef.current.volume = volumeRef.current;
    audioRef.current.loop = loopRef.current;
    return audioRef.current;
  }, []);

  const getCachedAudio = useCallback((identity: string, src: string, preload: "metadata" | "auto") => {
    const cached = audioCacheRef.current.get(identity);
    if (cached) {
      cached.preload = preload;
      return cached;
    }

    const audio = createAudioElement(preload);
    audio.src = src;
    audioCacheRef.current.set(identity, audio);
    return audio;
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
    }

    setPlaybackState("none");
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
      preloadedSrcRef.current = null;
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

  const preloadTrack = useCallback((nextTrack: KitTrack, mode: "metadata" | "auto" = "auto") => {
    if ((nextTrack.semitoneShift ?? 0) !== 0 || !nextTrack.src) return;
    const identity = getTrackIdentity(nextTrack);
    const cachedAudio = getCachedAudio(identity, nextTrack.src, mode);

    if (audioRef.current !== cachedAudio && preloadedSrcRef.current !== nextTrack.src) {
      preloaderRef.current = cachedAudio;
      preloadedSrcRef.current = nextTrack.src;
    }

    cachedAudio.preload = mode;
    if (!cachedAudio.src) cachedAudio.src = nextTrack.src;
    cachedAudio.load();
  }, [getCachedAudio]);

  const playTrack = useCallback(async (nextTrack: KitTrack) => {
    if (!nextTrack.src) return;

    const identity = getTrackIdentity(nextTrack);
    const clickAt = nowPerf();
    const metric: PlaybackMetric = { id: identity, src: nextTrack.src, clickAt };
    playbackMetricRef.current = metric;
    logPlaybackMetric(metric, "PLAY_CLICK");
    const canReusePreloader = (nextTrack.semitoneShift ?? 0) === 0 && preloadedSrcRef.current === nextTrack.src && preloaderRef.current?.src;

    hardInvalidatePlayback();
    const requestSerial = requestSerialRef.current;

    await runTransition(async () => {
      if (requestSerialRef.current !== requestSerial) return;

      let audio = ensureAudio();
      const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionIdRef.current = sessionId;
      activeIdentityRef.current = identity;
      setErrorMessage(null);
      setTrack(nextTrack);
      trackRef.current = nextTrack;
      updateMediaSessionMetadata(nextTrack);
      setPlaybackState("playing");
      setMediaSessionActionHandlers({
        play: () => { void playTrack(nextTrack); },
        pause: () => {
          const currentAudio = audioRef.current;
          try { pitchControllerRef.current?.pause(); } catch {}
          try { currentAudio?.pause(); } catch {}
          setPlaybackState("paused");
          setIsPlaying(false);
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

      const abortController = new AbortController();
      abortRef.current = abortController;

      let reusedPreloader = false;
      if ((nextTrack.semitoneShift ?? 0) === 0) {
        audio = getCachedAudio(identity, nextTrack.src, "auto");
        audioRef.current = audio;
        reusedPreloader = Boolean(canReusePreloader);
        if (preloaderRef.current === audio) preloadedSrcRef.current = null;
      } else if (canReusePreloader && preloaderRef.current) {
        audioRef.current = preloaderRef.current;
        audio = audioRef.current;
        preloaderRef.current = createAudioElement("auto");
        preloadedSrcRef.current = null;
        reusedPreloader = true;
      } else {
        audio.src = nextTrack.src;
      }

      metric.fetchStartAt = nowPerf();
      logPlaybackMetric(metric, "FETCH_AUDIO_START");
      audio.volume = volumeRef.current;
      audio.loop = loopRef.current;

      const onCanPlay = () => {
        if (playbackMetricRef.current !== metric) return;
        metric.fetchEndAt = readResourceResponseEnd(nextTrack.src, nowPerf());
        metric.canplayAt = nowPerf();
        logPlaybackMetric(metric, "FETCH_AUDIO_END");
        logPlaybackMetric(metric, "AUDIO_CANPLAY");
      };
      const onPlaying = () => {
        if (playbackMetricRef.current !== metric) return;
        if (!metric.canplayAt) {
          metric.fetchEndAt = readResourceResponseEnd(nextTrack.src, nowPerf());
          metric.canplayAt = nowPerf();
        }
        metric.playingAt = nowPerf();
        logPlaybackMetric(metric, "AUDIO_PLAYING");
        updateMediaSessionMetadata(nextTrack);
        setPlaybackState("playing");
      };
      audio.addEventListener("canplay", onCanPlay, { once: true });
      audio.addEventListener("playing", onPlaying, { once: true });
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
          try {
            await audio.play();
          } catch (firstPlayError) {
            if (!reusedPreloader || !isStillCurrent()) throw firstPlayError;
            const fallbackAudio = getCachedAudio(`${identity}::fallback`, nextTrack.src, "auto");
            fallbackAudio.volume = volumeRef.current;
            fallbackAudio.loop = loopRef.current;
            audioRef.current = fallbackAudio;
            audio = fallbackAudio;
            fallbackAudio.load();
            await fallbackAudio.play();
          }
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
        updateMediaSessionMetadata(nextTrack);
        setPlaybackState("playing");
        setIsPlaying(true);
        startRafLoop(sessionId, requestSerial, identity);
      } catch (error) {
        if (!isStillCurrent()) return;
        setPlaybackState("paused");
        setIsPlaying(false);
        setErrorMessage(normalizePlaybackError(error));
      }
    });
  }, [ensureAudio, getCachedAudio, hardInvalidatePlayback, runTransition, startRafLoop]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;

    if (isPlaying) {
      abortRef.current?.abort("pause");
      try { pitchControllerRef.current?.pause(); } catch {}
      audio.pause();
      setPlaybackState("paused");
      setIsPlaying(false);
      return;
    }

    await playTrack(trackRef.current);
  }, [isPlaying, playTrack]);

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
