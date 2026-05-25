"use client";

import { Pause, Play, RotateCcw, RotateCw, Repeat2, Volume2 } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useGlobalAudioPlayer } from "@/components/public/global-audio-player-provider";

interface HarmomusPlayerProps {
  src: string | null;
  title: string;
  canPlay: boolean;
  semitoneShift?: number;
  onBlocked: () => void;
}

export function HarmomusPlayer({ src, title, canPlay, semitoneShift = 0, onBlocked }: HarmomusPlayerProps) {
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
    closePlayer,
  } = useGlobalAudioPlayer();

  const currentSemitoneShift = track?.semitoneShift ?? 0;
  const isCurrentTrack = Boolean(track && track.src === src && track.title === title && currentSemitoneShift === semitoneShift);
  const hasStaleActiveTrack = Boolean(track && !isCurrentTrack);

  useEffect(() => {
    if (!hasStaleActiveTrack) return;
    closePlayer();
  }, [hasStaleActiveTrack, closePlayer]);

  useEffect(() => {
    if (!src && track) closePlayer();
  }, [src, track, closePlayer]);

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

    closePlayer();

    await playTrack({
      src,
      title,
      semitoneShift,
    });
  }

  function handlePreload() {
    if (!canPlay || !src || isPlaying) return;

    preloadTrack({
      src,
      title,
      semitoneShift,
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
