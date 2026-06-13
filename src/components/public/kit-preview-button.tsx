"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";

type KitPreviewButtonProps = {
  audioUrl?: string | null;
  startSeconds?: number | null;
  durationSeconds?: number | null;
  label?: string;
};

type PreviewState = "idle" | "loading" | "playing" | "error";

let activeAudio: HTMLAudioElement | null = null;
let activeStopTimer: number | null = null;
let activeProgressTimer: number | null = null;
let activeReset: (() => void) | null = null;
let activeToken = 0;

function clearActiveTimers() {
  if (activeStopTimer) window.clearTimeout(activeStopTimer);
  if (activeProgressTimer) window.clearInterval(activeProgressTimer);
  activeStopTimer = null;
  activeProgressTimer = null;
}

function resetActiveAudio() {
  clearActiveTimers();
  activeToken += 1;
  if (activeAudio) activeAudio.pause();
  activeAudio = null;
  activeReset?.();
  activeReset = null;
}

function clampNumber(value: number | null | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function canSeek(audio: HTMLAudioElement) {
  return audio.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(audio.duration);
}

function waitForMetadata(audio: HTMLAudioElement, timeoutMs = 1800) {
  if (canSeek(audio)) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const cleanup = () => {
      window.clearTimeout(timeout);
      audio.removeEventListener("loadedmetadata", done);
      audio.removeEventListener("canplay", done);
      audio.removeEventListener("error", done);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const timeout = window.setTimeout(done, timeoutMs);

    audio.addEventListener("loadedmetadata", done, { once: true });
    audio.addEventListener("canplay", done, { once: true });
    audio.addEventListener("error", done, { once: true });
  });
}

export function KitPreviewButton({ audioUrl, startSeconds, durationSeconds, label = "Ouvir preview" }: KitPreviewButtonProps) {
  const [state, setState] = useState<PreviewState>("idle");
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preparedUrlRef = useRef<string | null>(null);
  const errorResetTimerRef = useRef<number | null>(null);
  const localTokenRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const previewStartRef = useRef(0);
  const previewDurationRef = useRef(10);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (errorResetTimerRef.current) window.clearTimeout(errorResetTimerRef.current);
      if (activeAudio === audioRef.current) resetActiveAudio();
    };
  }, []);

  useEffect(() => {
    function enforcePreviewWindow() {
      const audio = audioRef.current;
      if (!audio || activeAudio !== audio || !isPlayingRef.current) return;

      const startedAt = startedAtRef.current;
      const elapsed = startedAt ? (performance.now() - startedAt) / 1000 : 0;
      const start = previewStartRef.current;
      const duration = previewDurationRef.current;

      if (elapsed >= duration || audio.currentTime >= start + duration + 0.15) {
        audio.pause();
        try {
          audio.currentTime = start;
        } catch {
          // ignore seek failures after OS media-session resume
        }
        resetActiveAudio();
      }
    }

    document.addEventListener("visibilitychange", enforcePreviewWindow);
    window.addEventListener("focus", enforcePreviewWindow);
    return () => {
      document.removeEventListener("visibilitychange", enforcePreviewWindow);
      window.removeEventListener("focus", enforcePreviewWindow);
    };
  }, []);

  useEffect(() => {
    if (!audioUrl || preparedUrlRef.current === audioUrl) return;
    if (audioRef.current && activeAudio !== audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    audioRef.current = null;
    preparedUrlRef.current = null;
    setState("idle");
    setProgress(0);
    isPlayingRef.current = false;
  }, [audioUrl]);

  if (!audioUrl) return null;

  const isLoading = state === "loading";
  const isPlaying = state === "playing";
  const hasError = state === "error";

  function prepareAudio() {
    if (!audioUrl) return null;
    if (audioRef.current && preparedUrlRef.current === audioUrl) return audioRef.current;

    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = audioUrl;
    audioRef.current = audio;
    preparedUrlRef.current = audioUrl;
    audio.load();
    return audio;
  }

  function resetThisButton() {
    setState("idle");
    setProgress(0);
    isPlayingRef.current = false;
    startedAtRef.current = null;
  }

  function stopCurrentPreview(resetToStart = true) {
    const audio = audioRef.current;
    clearActiveTimers();
    activeToken += 1;
    if (audio) {
      audio.pause();
      if (resetToStart) {
        try {
          audio.currentTime = previewStartRef.current;
        } catch {
          // ignore
        }
      }
    }
    if (activeAudio === audio) activeAudio = null;
    activeReset = null;
    resetThisButton();
  }

  function showErrorBriefly() {
    setState("error");
    setProgress(0);
    isPlayingRef.current = false;
    if (errorResetTimerRef.current) window.clearTimeout(errorResetTimerRef.current);
    errorResetTimerRef.current = window.setTimeout(() => setState("idle"), 1200);
  }

  function finishPreview(audio: HTMLAudioElement, token: number, start: number) {
    if (localTokenRef.current !== token || activeAudio !== audio) return;
    clearActiveTimers();
    audio.pause();
    try {
      audio.currentTime = start;
    } catch {
      // ignore
    }
    resetActiveAudio();
  }

  function startProgressTimer(audio: HTMLAudioElement, token: number, start: number, duration: number) {
    startedAtRef.current = performance.now();
    activeProgressTimer = window.setInterval(() => {
      if (localTokenRef.current !== token || activeAudio !== audio) return;
      const elapsed = startedAtRef.current ? (performance.now() - startedAtRef.current) / 1000 : 0;
      setProgress(Math.min(100, (elapsed / duration) * 100));

      if (elapsed >= duration || audio.currentTime >= start + duration + 0.15) {
        finishPreview(audio, token, start);
      }
    }, 100);
    activeStopTimer = window.setTimeout(() => finishPreview(audio, token, start), duration * 1000);
  }

  async function playFromPreviewStart(audio: HTMLAudioElement) {
    clearActiveTimers();
    audio.pause();

    const start = clampNumber(startSeconds, 0, 0, 60 * 60 * 3);
    const duration = clampNumber(durationSeconds, 10, 3, 30);
    const token = activeToken + 1;
    activeToken = token;
    localTokenRef.current = token;
    previewStartRef.current = start;
    previewDurationRef.current = duration;

    setState("loading");
    setProgress(0);
    isPlayingRef.current = false;
    activeAudio = audio;
    activeReset = resetThisButton;

    const finalize = () => finishPreview(audio, token, start);

    audio.addEventListener("ended", finalize, { once: true });
    audio.addEventListener(
      "error",
      () => {
        if (localTokenRef.current === token && activeAudio === audio) {
          resetActiveAudio();
          showErrorBriefly();
        }
      },
      { once: true },
    );

    try {
      await waitForMetadata(audio);
      if (localTokenRef.current !== token) return;

      if (canSeek(audio) && audio.duration > start) {
        audio.currentTime = start;
      } else if (start === 0) {
        audio.currentTime = 0;
      }

      await audio.play();
      if (localTokenRef.current !== token) return;
      isPlayingRef.current = true;
      setState("playing");
      startProgressTimer(audio, token, start, duration);
    } catch (error) {
      console.warn("[kit-preview] playback failed", error);
      resetActiveAudio();
      showErrorBriefly();
    }
  }

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!audioUrl) return;

    const audio = prepareAudio();
    if (!audio) {
      showErrorBriefly();
      return;
    }

    // Clique enquanto está tocando ou carregando deve parar completamente.
    if ((isPlaying || isLoading) && activeAudio === audio) {
      stopCurrentPreview(true);
      return;
    }

    if (activeAudio && activeAudio !== audio) resetActiveAudio();
    await playFromPreviewStart(audio);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={prepareAudio}
      onTouchStart={prepareAudio}
      aria-label={label}
      aria-busy={isLoading}
      title={label}
      className="absolute bottom-3 right-3 z-30 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:scale-105 hover:border-cyan-200/70 hover:bg-black/65 hover:shadow-[0_0_28px_rgba(34,211,238,0.35)] focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
    >
      {isLoading ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      ) : hasError ? (
        <span className="relative z-10 text-xs font-black leading-none">!</span>
      ) : (
        <span className="relative z-10 text-sm font-black leading-none">{isPlaying ? "❚❚" : "▶"}</span>
      )}
      {isPlaying ? <span className="absolute inset-x-0 bottom-0 h-1 bg-cyan-300/80" style={{ width: `${progress}%` }} /> : null}
      {isLoading ? <span className="absolute inset-0 animate-pulse bg-cyan-300/10" /> : null}
      {hasError ? <span className="absolute inset-0 bg-red-500/25" /> : null}
    </button>
  );
}
