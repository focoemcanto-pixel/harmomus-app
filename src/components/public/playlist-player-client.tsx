"use client";

import Link from "next/link";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { PublicPlaylist } from "@/lib/data/playlists";

interface PlaylistPlayerClientProps {
  playlist: PublicPlaylist;
}

type QueueItem = {
  id: string;
  kitId: string;
  coverUrl: string | null;
  kitName: string;
  artist: string;
  category: string;
  tone: string | null;
  voice: string | null;
  trackName: string;
  src: string | null;
};

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export function PlaylistPlayerClient({ playlist }: PlaylistPlayerClientProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [replayAtEnd, setReplayAtEnd] = useState(false);

  const queue = useMemo<QueueItem[]>(() => {
    const items: QueueItem[] = [];

    for (const kit of playlist.kits) {
      if (kit.tracks.length > 0) {
        for (const track of kit.tracks) {
          items.push({
            id: `${kit.id}-${track.id}`,
            kitId: kit.id,
            coverUrl: kit.cover_url,
            kitName: kit.name,
            artist: kit.artist,
            category: kit.category?.name ?? "Sem categoria",
            tone: track.tone,
            voice: track.voice,
            trackName: track.name,
            src: track.streamUrl,
          });
        }
      } else {
        items.push({
          id: `${kit.id}-fallback`,
          kitId: kit.id,
          coverUrl: kit.cover_url,
          kitName: kit.name,
          artist: kit.artist,
          category: kit.category?.name ?? "Sem categoria",
          tone: null,
          voice: null,
          trackName: "Faixa indisponível",
          src: null,
        });
      }
    }

    return items;
  }, [playlist.kits]);

  const currentItem = queue[currentIndex] ?? null;

  useEffect(() => {
    setCurrentIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [playlist.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
    if (currentItem?.src && isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    }
  }, [currentIndex]);

  const playAt = (index: number) => {
    if (index < 0 || index >= queue.length) return;
    setCurrentIndex(index);
    setIsPlaying(true);
  };

  const next = () => {
    if (queue.length === 0) return;
    if (currentIndex >= queue.length - 1) {
      if (replayAtEnd) {
        setCurrentIndex(0);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
      return;
    }
    setCurrentIndex((prev) => prev + 1);
    setIsPlaying(true);
  };

  const prev = () => {
    if (currentIndex <= 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((prevIndex) => prevIndex - 1);
    setIsPlaying(true);
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !currentItem?.src) return;

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audio.pause();
    setIsPlaying(false);
  };

  if (!currentItem) {
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-6 text-white">Playlist vazia.</main>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8">
      <audio
        ref={audioRef}
        src={currentItem.src ?? undefined}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={next}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        className="hidden"
      />

      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/95 to-zinc-800/60 p-5 shadow-premium md:p-7">
          <p className="text-sm text-zinc-300">Playlist pública</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">{playlist.name}</h1>

          <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
            <img src={currentItem.coverUrl ?? "https://placehold.co/800x800/101114/f4f4f5?text=Harmomus"} alt={currentItem.kitName} className="aspect-square w-full rounded-2xl border border-white/10 object-cover" />
            <div className="flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Tocando agora</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{currentItem.kitName}</h2>
                <p className="text-zinc-300">{currentItem.artist}</p>
                <p className="mt-2 text-sm text-gold-300">{currentItem.category}</p>
                <p className="mt-2 text-sm text-zinc-300">Faixa: {currentItem.trackName}</p>
                {(currentItem.tone || currentItem.voice) && <p className="text-sm text-zinc-300">Tom/Voz: {currentItem.tone ?? "-"} • {currentItem.voice ?? "-"}</p>}
              </div>

              <div className="mt-6">
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  value={currentTime}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setCurrentTime(value);
                    if (audioRef.current) audioRef.current.currentTime = value;
                  }}
                  className="w-full"
                />
                <div className="mt-1 flex justify-between text-xs text-zinc-300">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button onClick={prev} className="rounded-full border border-white/20 p-3 text-white"><SkipBack size={18} /></button>
                  <button onClick={togglePlay} disabled={!currentItem.src} className="rounded-full border border-gold-400/50 bg-black/40 p-4 text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button onClick={next} className="rounded-full border border-white/20 p-3 text-white"><SkipForward size={18} /></button>
                  <button onClick={() => setReplayAtEnd((v) => !v)} className={`rounded-full border px-4 py-2 text-sm ${replayAtEnd ? "border-gold-300 text-gold-300" : "border-white/20 text-zinc-200"}`}>
                    Replay {replayAtEnd ? "ON" : "OFF"}
                  </button>
                  <Link href="/minhas-playlists" className="ml-auto rounded-full border border-white/20 px-4 py-2 text-sm text-zinc-100">
                    Sair da playlist
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-black/30 p-4 md:p-5">
          <h3 className="text-lg font-medium text-white">Fila</h3>
          <div className="mt-4 space-y-2">
            {queue.map((item, index) => (
              <button
                key={item.id}
                onClick={() => playAt(index)}
                className={`grid w-full grid-cols-[52px_1fr] gap-3 rounded-xl p-2 text-left transition ${index === currentIndex ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
              >
                <img src={item.coverUrl ?? "https://placehold.co/120x120/101114/f4f4f5?text=Kit"} alt={item.kitName} className="h-12 w-12 rounded-lg object-cover" />
                <div>
                  <p className="line-clamp-1 text-sm text-white">{item.kitName}</p>
                  <p className="line-clamp-1 text-xs text-zinc-300">{item.trackName}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
