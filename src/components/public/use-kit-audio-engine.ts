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

const MAX_AUDIO_CACHE_SIZE = 12;
const HAVE_CURRENT_DATA = 2;
const HAVE_FUTURE_DATA = 3;
const NETWORK_EMPTY = 0;
const NETWORK_LOADING = 2;
const SIGNED_URL_CACHE_SAFETY_MS = 30_000;
const SIGNED_URL_SESSION_PREFIX = "harmomus:signed-audio-url:";

type PlaybackMetric = {
  id: string;
  src: string;
  clickAt: number;
  fetchStartAt?: number;
  fetchEndAt?: number;
  canplayAt?: number;
  playingAt?: number;
};

type SignedUrlCacheEntry = {
  url?: string;
  expiresAt: number;
  promise?: Promise<string>;
};

function nowPerf() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function nowMs() {
  return Date.now();
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

function shouldWarmAudio(audio: HTMLAudioElement) {
  if (!audio.src) return false;
  if (audio.readyState >= HAVE_CURRENT_DATA) return false;
  if (audio.networkState === NETWORK_LOADING) return false;
  return true;
}

function shouldReloadBeforePlay(audio: HTMLAudioElement) {
  if (!audio.src) return false;
  if (audio.readyState >= HAVE_FUTURE_DATA) return false;
  if (audio.networkState === NETWORK_LOADING && audio.readyState >= HAVE_CURRENT_DATA) return false;
  return audio.networkState === NETWORK_EMPTY || audio.readyState < HAVE_CURRENT_DATA;
}

function warmAudio(audio: HTMLAudioElement) {
  if (!shouldWarmAudio(audio)) return;
  try { audio.load(); } catch {}
}

function getSignedUrlResolverPath(src: string) {
  const value = String(src ?? "").trim();
  const match = value.match(/^\/api\/audio\/([^/?#]+)(?:\/signed)?([?#].*)?$/);
  if (!match?.[1]) return null;
  return `/api/audio/${match[1]}/signed-url${match[2] ?? ""}`;
}

function readSessionSignedUrl(resolverPath: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${SIGNED_URL_SESSION_PREFIX}${resolverPath}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: string; expiresAt?: number };
    if (!parsed.url || !parsed.expiresAt || parsed.expiresAt <= nowMs()) {
      window.sessionStorage.removeItem(`${SIGNED_URL_SESSION_PREFIX}${resolverPath}`);
      return null;
    }
    return parsed.url;
  } catch {
    return null;
  }
}

function writeSessionSignedUrl(resolverPath: string, url: string, expiresAt: number) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${SIGNED_URL_SESSION_PREFIX}${resolverPath}`, JSON.stringify({ url, expiresAt }));
  } catch {}
}

async function fetchSignedAudioUrl(src: string) {
  const resolverPath = getSignedUrlResolverPath(src);
  if (!resolverPath) return src;

  const response = await fetch(resolverPath, {
    method: "GET",
    credentials: "same-origin",
    cache: "force-cache",
  });

  if (!response.ok) throw new Error("Não foi possível preparar este áudio.");
  const payload = await response.json() as { url?: string; expiresIn?: number };
  if (!payload.url) throw new Error("URL do áudio indisponível.");
  return payload.url;
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
  const signedUrlCacheRef = useRef<Map<string, SignedUrlCacheEntry>>(new Map());
  const playbackMetricRef = useRef<PlaybackMetric | null>(null);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudioElement("auto");
    if (!preloaderRef.current) preloaderRef.current = createAudioElement("auto");
    audioRef.current.volume = volumeRef.current;
    audioRef.current.loop = loopRef.current;
    return audioRef.current;
  }, []);

  const resolvePlayableAudioUrl = useCallback(async (src: string) => {
    const fastSrc = resolveFastAudioUrl(src);
    const resolverPath = getSignedUrlResolverPath(fastSrc);
    if (!resolverPath) return fastSrc;

    const cached = signedUrlCacheRef.current.get(resolverPath);
    if (cached?.url && cached.expiresAt > nowMs()) return cached.url;
    if (cached?.promise) return cached.promise;

    const sessionCachedUrl = readSessionSignedUrl(resolverPath);
    if (sessionCachedUrl) {
      const expiresAt = nowMs() + 10 * 60 * 1000;
      signedUrlCacheRef.current.set(resolverPath, { url: sessionCachedUrl, expiresAt });
      return sessionCachedUrl;
    }

    const promise = fetchSignedAudioUrl(fastSrc).then((url) => {
      const expiresAt = nowMs() + 55 * 60 * 1000 - SIGNED_URL_CACHE_SAFETY_MS;
      signedUrlCacheRef.current.set(resolverPath, { url, expiresAt });
      writeSessionSignedUrl(resolverPath, url, expiresAt);
      return url;
    }).catch((error) => {
      signedUrlCacheRef.current.delete(resolverPath);
      throw error;
    });

    signedUrlCacheRef.current.set(resolverPath, { promise, expiresAt: nowMs() + 30_000 });
    return promise;
  }, []);

  const syncAudioState = useCallback((audio: HTMLAudioElement) => {
    setCurrentTime(audio.currentTime || 0);
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    setIsPlaying(!audio.paused && !audio.ended);
  }, []);

  const attachAudioStateListeners = useCallback((audio: HTMLAudioElement, isStillCurrent: () => boolean, signal: AbortSignal) => {
    const sync = () => { if (isStillCurrent()) syncAudioState(audio); };
    const markEnded = () => { if (isStillCurrent()) { syncAudioState(audio); setIsPlaying(false); setIsPreparing(false); } };
    audio.addEventListener("timeupdate", sync, { signal });
    audio.addEventListener("loadedmetadata", sync, { signal });
    audio.addEventListener("durationchange", sync, { signal });
    audio.addEventListener("playing", sync, { signal });
    audio.addEventListener("pause", sync, { signal });
    audio.addEventListener("ended", markEnded, { signal });
    sync();
  }, [syncAudioState]);

  const stopAllAudioElements = useCallback((options: { resetTime?: boolean; clearSources?: boolean } = {}) => {
    stopAudioElement(audioRef.current, { resetTime: options.resetTime, clearSource: options.clearSources });
    stopAudioElement(preloaderRef.current, { resetTime: options.resetTime, clearSource: options.clearSources });
    audioCacheRef.current.forEach((cachedAudio) => stopAudioElement(cachedAudio, { resetTime: options.resetTime, clearSource: options.clearSources }));
  }, []);

  const trimAudioCache = useCallback((keepIdentity?: string) => {
    if (audioCacheRef.current.size <= MAX_AUDIO_CACHE_SIZE) return;
    for (const [key, cachedAudio] of audioCacheRef.current) {
      if (audioCacheRef.current.size <= MAX_AUDIO_CACHE_SIZE) break;
      if (key === keepIdentity) continue;
      if (cachedAudio === audioRef.current || cachedAudio === preloaderRef.current) continue;
      stopAudioElement(cachedAudio, { clearSource: true });
      audioCacheRef.current.delete(key);
    }
  }, []);

  const getCachedAudio = useCallback((identity: string, src: string, preload: "metadata" | "auto") => {
    const cached = audioCacheRef.current.get(identity);
    if (cached) {
      cached.preload = preload;
      if (cached.src !== src) cached.src = src;
      return cached;
    }
    const audio = createAudioElement(preload);
    audio.src = src;
    audioCacheRef.current.set(identity, audio);
    trimAudioCache(identity);
    return audio;
  }, [trimAudioCache]);

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
    stopAllAudioElements({ resetTime: true });
    setIsPlaying(false);
    setIsPreparing(false);
    setCurrentTime(0);
    setDuration(0);
    setErrorMessage(null);
    setTrack(null);
    trackRef.current = null;
  }, [cancelRaf, stopAllAudioElements]);

  const disposePlaybackSession = useCallback(async () => {
    hardInvalidatePlayback();
    stopAllAudioElements({ resetTime: true, clearSources: true });
    audioCacheRef.current.clear();
    preloadedSrcRef.current = null;
  }, [hardInvalidatePlayback, stopAllAudioElements]);

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
    const baseTrack = normalizeTrackSource(nextTrack);
    if ((baseTrack.semitoneShift ?? 0) !== 0 || !baseTrack.src) return;
    const identity = getTrackIdentity(baseTrack);

    void resolvePlayableAudioUrl(baseTrack.src).then((playableSrc) => {
      const cachedAudio = getCachedAudio(identity, playableSrc, mode);
      if (audioRef.current !== cachedAudio && preloadedSrcRef.current !== playableSrc) {
        preloaderRef.current = cachedAudio;
        preloadedSrcRef.current = playableSrc;
      }
      cachedAudio.preload = mode;
      warmAudio(cachedAudio);
    }).catch(() => undefined);
  }, [getCachedAudio, resolvePlayableAudioUrl]);

  const playTrack = useCallback(async (nextTrack: KitTrack) => {
    const baseTrack = normalizeTrackSource(nextTrack);
    if (!baseTrack.src) return;

    setIsPreparing(true);
    const identity = getTrackIdentity(baseTrack);
    const clickAt = nowPerf();
    const metric: PlaybackMetric = { id: identity, src: baseTrack.src, clickAt };
    playbackMetricRef.current = metric;
    logPlaybackMetric(metric, "PLAY_CLICK");

    let playableSrc = baseTrack.src;
    try {
      playableSrc = await resolvePlayableAudioUrl(baseTrack.src);
    } catch (error) {
      setIsPreparing(false);
      setErrorMessage(normalizePlaybackError(error));
      return;
    }

    const fastTrack = { ...baseTrack, src: playableSrc };
    const canReusePreloader = (fastTrack.semitoneShift ?? 0) === 0 && preloadedSrcRef.current === fastTrack.src && preloaderRef.current?.src;

    hardInvalidatePlayback();
    setIsPreparing(true);
    const requestSerial = requestSerialRef.current;

    await runTransition(async () => {
      if (requestSerialRef.current !== requestSerial) return;

      let audio = ensureAudio();
      const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionIdRef.current = sessionId;
      activeIdentityRef.current = identity;
      setErrorMessage(null);
      setTrack(baseTrack);
      trackRef.current = baseTrack;
      updateMediaSessionMetadata(baseTrack);
      setMediaSessionActionHandlers({
        play: () => { void playTrack(nextTrack); },
        pause: () => {
          abortRef.current?.abort("media-session-pause");
          try { pitchControllerRef.current?.pause(); } catch {}
          stopAllAudioElements({ resetTime: false });
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

      const abortController = new AbortController();
      abortRef.current = abortController;
      let reusedPreloader = false;

      if ((fastTrack.semitoneShift ?? 0) === 0) {
        audio = getCachedAudio(identity, fastTrack.src, "auto");
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
        audio.src = fastTrack.src;
      }

      const isStillCurrent = () => (
        !abortController.signal.aborted &&
        sessionIdRef.current === sessionId &&
        requestSerialRef.current === requestSerial &&
        activeIdentityRef.current === identity &&
        getTrackIdentity(trackRef.current) === identity
      );

      metric.src = fastTrack.src;
      metric.fetchStartAt = nowPerf();
      logPlaybackMetric(metric, "FETCH_AUDIO_START");
      audio.volume = volumeRef.current;
      audio.loop = loopRef.current;
      attachAudioStateListeners(audio, isStillCurrent, abortController.signal);

      const onCanPlay = () => {
        if (playbackMetricRef.current !== metric) return;
        metric.fetchEndAt = readResourceResponseEnd(fastTrack.src, nowPerf());
        metric.canplayAt = nowPerf();
        logPlaybackMetric(metric, "FETCH_AUDIO_END");
        logPlaybackMetric(metric, "AUDIO_CANPLAY");
      };
      const onPlaying = () => {
        if (playbackMetricRef.current !== metric) return;
        if (!metric.canplayAt) {
          metric.fetchEndAt = readResourceResponseEnd(fastTrack.src, nowPerf());
          metric.canplayAt = nowPerf();
        }
        metric.playingAt = nowPerf();
        logPlaybackMetric(metric, "AUDIO_PLAYING");
      };
      audio.addEventListener("canplay", onCanPlay, { once: true, signal: abortController.signal });
      audio.addEventListener("playing", onPlaying, { once: true, signal: abortController.signal });
      if (shouldReloadBeforePlay(audio)) audio.load();

      try {
        const shift = fastTrack.semitoneShift ?? 0;
        if (shift === 0) {
          if (!isStillCurrent()) return;
          try {
            await audio.play();
          } catch (firstPlayError) {
            if (!reusedPreloader || !isStillCurrent()) throw firstPlayError;
            const fallbackAudio = getCachedAudio(`${identity}::fallback`, fastTrack.src, "auto");
            fallbackAudio.volume = volumeRef.current;
            fallbackAudio.loop = loopRef.current;
            audioRef.current = fallbackAudio;
            audio = fallbackAudio;
            attachAudioStateListeners(fallbackAudio, isStillCurrent, abortController.signal);
            if (shouldReloadBeforePlay(fallbackAudio)) fallbackAudio.load();
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
        syncAudioState(audio);
        setIsPreparing(false);
        setIsPlaying(true);
        startRafLoop(sessionId, requestSerial, identity);
      } catch (error) {
        if (!isStillCurrent()) return;
        setIsPreparing(false);
        setIsPlaying(false);
        setErrorMessage(normalizePlaybackError(error));
      }
    });
  }, [attachAudioStateListeners, ensureAudio, getCachedAudio, hardInvalidatePlayback, resolvePlayableAudioUrl, runTransition, startRafLoop, stopAllAudioElements, syncAudioState]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !trackRef.current) return;

    if (isPlaying) {
      abortRef.current?.abort("pause");
      try { pitchControllerRef.current?.pause(); } catch {}
      stopAllAudioElements({ resetTime: false });
      setIsPlaying(false);
      setIsPreparing(false);
      return;
    }

    await playTrack(trackRef.current);
  }, [isPlaying, playTrack, stopAllAudioElements]);

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
    audioCacheRef.current.forEach((cachedAudio) => { cachedAudio.volume = next; });
  }, []);

  const setLoopValue = useCallback((value: boolean) => {
    loopRef.current = value;
    setLoop(value);
    if (audioRef.current) audioRef.current.loop = value;
  }, []);

  useEffect(() => {
    ensureAudio();
    return () => { void runTransition(disposePlaybackSession); };
  }, [disposePlaybackSession, ensureAudio, runTransition]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = () => { if (document.hidden) hardInvalidatePlayback(); };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [hardInvalidatePlayback]);

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
    stopPlayback: hardInvalidatePlayback,
    disposePlaybackSession: () => runTransition(disposePlaybackSession),
    isCurrentTrack: (trackToCheck: KitTrack) => getTrackIdentity(trackRef.current) === getTrackIdentity(trackToCheck),
  };
}
