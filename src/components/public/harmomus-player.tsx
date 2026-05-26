"use client";

import { Pause, Play, RotateCcw, RotateCw, Repeat2, Volume2 } from "lucide-react";
import { useMemo } from "react";

import { type KitTrack, useKitAudioEngine } from "@/components/public/use-kit-audio-engine";

interface HarmomusPlayerProps {
  engine: ReturnType<typeof useKitAudioEngine>;
  src: string | null;
  title: string;
  canPlay: boolean;
  semitoneShift?: number;
  onBlocked: () => void;
}

function parseTrackMeta(title: string) {
  const toneMatch = title.match(/Tom\s+(.+?)\s+•/i);
  const voiceMatch = title.match(/Voz\s+(.+)$/i);
  return {
    tone: toneMatch?.[1]?.trim() || "unknown-tone",
    voice: voiceMatch?.[1]?.trim().toLowerCase() || "unknown-voice",
  };
}

export function HarmomusPlayer({ engine, src, title, canPlay, semitoneShift = 0, onBlocked }: HarmomusPlayerProps) {
  const {
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
    isCurrentTrack: engineIsCurrentTrack,
  } = engine;

  const trackMeta = useMemo(() => parseTrackMeta(title), [title]);
  const trackId = useMemo(
    () => [src ?? "no-src", title, trackMeta.voice, trackMeta.tone, String(semitoneShift)].join("::"),
    [src, title, trackMeta.voice, trackMeta.tone, semitoneShift],
  );

  const currentSemitoneShift = track?.semitoneShift ?? 0;
  const candidateTrack: KitTrack = { src: src ?? "", title, semitoneShift, trackId };
  const isCurrentTrack = Boolean(track && src && currentSemitoneShift === semitoneShift && engineIsCurrentTrack(candidateTrack));

  const formatTime = useMemo(
    () => (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`,
    [],
  );

  async function handlePlay() {
    if (!canPlay) {
      onBlocked();
      return;
    }

    if (!src) return;

    if (isCurrentTrack) {
      await togglePlay();
      return;
    }

    await playTrack({
      src,
      title,
      semitoneShift,
      trackId,
    });
  }

  function handlePreload() {
    if (!canPlay || !src || isPlaying || semitoneShift !== 0) return;

    preloadTrack({
      src,
      title,
      semitoneShift,
      trackId,
    });
  }

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/30 p-4"
      onMouseEnter={handlePreload}
      onTouchStart={handlePreload}
      onFocus={handlePreload}
    >
      <p className="mb-3 text-sm text-muted">{title}</p>

      <div className="flex items-center gap-3">
        <button onClick={() => skipBy(-10)} disabled={!isCurrentTrack} className="disabled:opacity-40">
          <RotateCcw size={18} />
        </button>

        <button onClick={handlePlay} className="rounded-full border border-gold-400/50 p-2">
          {isPlaying && isCurrentTrack ? <Pause size={18} /> : <Play size={18} />}
        </button>

        <button onClick={() => skipBy(10)} disabled={!isCurrentTrack} className="disabled:opacity-40">
          <RotateCw size={18} />
        </button>

        <button onClick={() => setLoopValue(!loop)} className={loop ? "text-gold-300" : ""}>
          <Repeat2 size={18} />
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Volume2 size={16} />

          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolumeValue(Number(e.target.value))}
          />
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={duration || 0}
        value={isCurrentTrack ? currentTime : 0}
        onChange={(e) => seekTo(Number(e.target.value))}
        disabled={!isCurrentTrack}
        className="mt-3 w-full disabled:opacity-40"
      />

      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>{formatTime(isCurrentTrack ? currentTime : 0)}</span>
        <span>{formatTime(isCurrentTrack ? duration : 0)}</span>
      </div>

      {semitoneShift !== 0 ? (
        <p className="mt-2 text-xs text-gold-300">Modulação ativa: {semitoneShift > 0 ? `+${semitoneShift}` : semitoneShift} semitom(ns)</p>
      ) : null}

      {errorMessage && isCurrentTrack ? <p className="mt-2 text-xs text-amber-300">{errorMessage}</p> : null}
    </div>
  );
}
