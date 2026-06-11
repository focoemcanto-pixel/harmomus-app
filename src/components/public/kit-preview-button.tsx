"use client";

import { type MouseEvent, useEffect, useRef, useState } from "react";

type KitPreviewButtonProps = {
  audioUrl?: string | null;
  startSeconds?: number | null;
  durationSeconds?: number | null;
  label?: string;
};

let activeAudio: HTMLAudioElement | null = null;
let activeStopTimer: ReturnType<typeof window.setTimeout> | null = null;
let activeProgressTimer: ReturnType<typeof window.setInterval> | null = null;
let activeReset: (() => void) | null = null;

function clearActiveTimers() {
  if (activeStopTimer) window.clearTimeout(activeStopTimer);
  if (activeProgressTimer) window.clearInterval(activeProgressTimer);
  activeStopTimer = null;
  activeProgressTimer = null;
}

function resetActiveAudio() {
  clearActiveTimers();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }
  activeAudio = null;
  activeReset?.();
  activeReset = null;
}

function clampNumber(value: number | null | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function KitPreviewButton({ audioUrl, startSeconds, durationSeconds, label = "Ouvir preview" }: KitPreviewButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (activeAudio === audioRef.current) resetActiveAudio();
    };
  }, []);

  if (!audioUrl) return null;

  function stopThisPreview() {
    if (activeAudio === audioRef.current) {
      resetActiveAudio();
    } else {
      setIsPlaying(false);
      setProgress(0);
    }
  }

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!audioUrl) return;
    if (isPlaying) {
      stopThisPreview();
      return;
    }

    resetActiveAudio();

    const audio = new Audio(audioUrl);
    audio.preload = "auto";
    audioRef.current = audio;
    activeAudio = audio;
    activeReset = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    const start = clampNumber(startSeconds, 0, 0, 60 * 60 * 3);
    const duration = clampNumber(durationSeconds, 10, 3, 30);

    audio.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(audio.duration) && audio.duration > start) audio.currentTime = start;
    }, { once: true });

    audio.addEventListener("ended", resetActiveAudio, { once: true });
    audio.addEventListener("error", resetActiveAudio, { once: true });

    try {
      audio.currentTime = start;
      await audio.play();
      setIsPlaying(true);
      setProgress(0);

      const startedAt = performance.now();
      activeProgressTimer = window.setInterval(() => {
        const elapsed = (performance.now() - startedAt) / 1000;
        setProgress(Math.min(100, (elapsed / duration) * 100));
      }, 120);

      activeStopTimer = window.setTimeout(resetActiveAudio, duration * 1000);
    } catch {
      resetActiveAudio();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className="absolute bottom-3 right-3 z-30 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:scale-105 hover:border-cyan-200/70 hover:bg-black/65 hover:shadow-[0_0_28px_rgba(34,211,238,0.35)] focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
    >
      <span className="relative z-10 text-sm font-black leading-none">{isPlaying ? "❚❚" : "▶"}</span>
      {isPlaying ? <span className="absolute inset-x-0 bottom-0 h-1 bg-cyan-300/80" style={{ width: `${progress}%` }} /> : null}
    </button>
  );
}
