"use client";

import { Pause, Play, RotateCcw, RotateCw, Repeat2, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface HarmomusPlayerProps {
  src: string | null;
  title: string;
  canPlay: boolean;
  onBlocked: () => void;
}

export function HarmomusPlayer({ src, title, canPlay, onBlocked }: HarmomusPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setErrorMessage(null);
  }, [src]);

  const formatTime = useMemo(
    () => (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`,
    [],
  );

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!canPlay) { onBlocked(); return; }
    if (!audio || !src) return;

    if (audio.paused) {
      document.querySelectorAll("audio[data-harmomus='player']").forEach((other) => {
        if (other !== audio) (other as HTMLAudioElement).pause();
      });
      try {
        await audio.play();
        setErrorMessage(null);
        setIsPlaying(true);
      } catch {
        setErrorMessage("Não foi possível reproduzir este áudio agora.");
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <audio
        data-harmomus="player"
        ref={audioRef}
        src={src ?? undefined}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onError={() => setErrorMessage("Áudio indisponível ou acesso negado.")}
        loop={loop}
        className="hidden"
      />
      <p className="mb-3 text-sm text-muted">{title}</p>
      <div className="flex items-center gap-3">
        <button onClick={() => audioRef.current && (audioRef.current.currentTime -= 10)}><RotateCcw size={18} /></button>
        <button onClick={togglePlay} className="rounded-full border border-gold-400/50 p-2">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
        <button onClick={() => audioRef.current && (audioRef.current.currentTime += 10)}><RotateCw size={18} /></button>
        <button onClick={() => setLoop((prev) => !prev)} className={loop ? "text-gold-300" : ""}><Repeat2 size={18} /></button>
        <div className="ml-auto flex items-center gap-2"><Volume2 size={16} /><input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); if (audioRef.current) audioRef.current.volume = v; }} /></div>
      </div>
      <input type="range" min={0} max={duration || 0} value={currentTime} onChange={(e) => { const next = Number(e.target.value); setCurrentTime(next); if (audioRef.current) audioRef.current.currentTime = next; }} className="mt-3 w-full" />
      <div className="mt-1 flex justify-between text-xs text-muted"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
      {errorMessage ? <p className="mt-2 text-xs text-amber-300">{errorMessage}</p> : null}
    </div>
  );
}
