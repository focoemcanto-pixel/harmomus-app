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

function clearActiveTimers() {
  if (activeStopTimer) window.clearTimeout(activeStopTimer);
  if (activeProgressTimer) window.clearInterval(activeProgressTimer);
  activeStopTimer = null;
  activeProgressTimer = null;
}

function resetActiveAudio() {
  clearActiveTimers();
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

  useEffect(() => {
    return () => {
      if (errorResetTimerRef.current) window.clearTimeout(errorResetTimerRef.current);
      if (activeAudio === audioRef.current) resetActiveAudio();
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
    audio.playsInline = true;
    audio.src = audioUrl;
    audioRef.current = audio;
    preparedUrlRef.current = audioUrl;
    audio.load();
    return audio;
  }

  function resetThisButton() {
    setState("idle");
    setProgress(0);
  }

  function showErrorBriefly() {
    setState("error");
    setProgress(0);
    if (errorResetTimerRef.current) window.clearTimeout(errorResetTimerRef.current);
    errorResetTimerRef.current = window.setTimeout(() => setState("idle"), 1200);
  }

  function stopThisPreview() {
    if (activeAudio === audioRef.current) resetActiveAudio();
    else resetThisButton();
  }

  function startProgressTimer(duration: number) {
    const startedAt = performance.now();
    activeProgressTimer = window.setInterval(() => {
      const elapsed = (performance.now() - startedAt) / 1000;
      setProgress(Math.min(100, (elapsed / duration) * 100));
    }, 80);
    activeStopTimer = window.setTimeout(resetActiveAudio, duration * 1000);
  }

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!audioUrl) return;
    if (isPlaying || isLoading) {
      stopThisPreview();
      return;
    }

    resetActiveAudio();
    setState("loading");
    setProgress(0);

    const audio = prepareAudio();
    if (!audio) {
      showErrorBriefly();
      return;
    }

    activeAudio = audio;
    activeReset = resetThisButton;

    const start = clampNumber(startSeconds, 0, 0, 60 * 60 * 3);
    const duration = clampNumber(durationSeconds, 10, 3, 30);

    const finalize = () => {
      if (activeAudio === audio) resetActiveAudio();
    };

    audio.addEventListener("ended", finalize, { once: true });
    audio.addEventListener("error", () => {
      if (activeAudio === audio) {
        resetActiveAudio();
        showErrorBriefly();
      }
    }, { once: true });

    try {
      // Em alguns browsers mobile, setar currentTime=0 antes dos metadados faz o play falhar.
      // Por isso só fazemos seek quando o início escolhido é maior que zero.
      if (start > 0) {
        await waitForMetadata(audio);
        if (canSeek(audio) && audio.duration > start) audio.currentTime = start;
      }

      await audio.play();
      setState("playing");
      startProgressTimer(duration);
    } catch (error) {
      console.warn("[kit-preview] playback failed", error);
      resetActiveAudio();
      showErrorBriefly();
    }
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
