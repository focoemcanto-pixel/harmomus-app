"use client";

import { Pause, Play, Repeat2, RotateCcw, RotateCw, Volume2, X } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type GlobalTrack = {
  src: string;
  title: string;
};

type GlobalAudioPlayerContextValue = {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  track: GlobalTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  loop: boolean;
  hasEnded: boolean;
  errorMessage: string | null;
  preloadedSrc: string | null;
  preloadTrack: (track: GlobalTrack) => void;
  playTrack: (track: GlobalTrack) => Promise<void>;
  togglePlay: () => Promise<void>;
  replay: () => Promise<void>;
  seekTo: (seconds: number) => void;
  skipBy: (seconds: number) => void;
  setVolumeValue: (value: number) => void;
  setLoopValue: (value: boolean) => void;
  closePlayer: () => void;
};

const GlobalAudioPlayerContext = createContext<GlobalAudioPlayerContextValue | null>(null);
const PLAYER_PREFS_KEY = "harmomus-player-preferences";

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function readStoredPreferences() {
  if (typeof window === "undefined") return { volume: 1, loop: false };
  try {
    const raw = window.localStorage.getItem(PLAYER_PREFS_KEY);
    if (!raw) return { volume: 1, loop: false };
    const parsed = JSON.parse(raw) as { volume?: number; loop?: boolean };
    return {
      volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(parsed.volume, 1)) : 1,
      loop: Boolean(parsed.loop),
    };
  } catch {
    return { volume: 1, loop: false };
  }
}

function storePreferences(volume: number, loop: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ volume, loop }));
  } catch {
    // localStorage pode estar indisponível em navegação privada.
  }
}

export function GlobalAudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<GlobalTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preloadedSrc, setPreloadedSrc] = useState<string | null>(null);

  useEffect(() => {
    const prefs = readStoredPreferences();
    setVolume(prefs.volume);
    setLoop(prefs.loop);
    if (audioRef.current) {
      audioRef.current.volume = prefs.volume;
      audioRef.current.loop = prefs.loop;
    }
  }, []);

  function preloadTrack(nextTrack: GlobalTrack) {
    if (!nextTrack.src || track?.src === nextTrack.src || preloadedSrc === nextTrack.src) return;
    const preloadAudio = preloadAudioRef.current;
    if (!preloadAudio) return;

    try {
      preloadAudio.src = nextTrack.src;
      preloadAudio.load();
      setPreloadedSrc(nextTrack.src);
    } catch {
      setPreloadedSrc(null);
    }
  }

  async function playTrack(nextTrack: GlobalTrack) {
    const audio = audioRef.current;
    if (!audio) return;

    setErrorMessage(null);
    setHasEnded(false);

    if (track?.src !== nextTrack.src) {
      setTrack(nextTrack);
      setCurrentTime(0);
      setDuration(0);
      audio.src = nextTrack.src;
      audio.load();
    } else {
      setTrack(nextTrack);
    }

    audio.volume = volume;
    audio.loop = loop;

    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      setErrorMessage("Não foi possível reproduzir este áudio agora.");
      setIsPlaying(false);
    }
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !track?.src) return;

    if (audio.paused) {
      try {
        if (hasEnded) audio.currentTime = 0;
        setHasEnded(false);
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
  }

  async function replay() {
    const audio = audioRef.current;
    if (!audio || !track?.src) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    setHasEnded(false);
    try {
      await audio.play();
      setErrorMessage(null);
      setIsPlaying(true);
    } catch {
      setErrorMessage("Não foi possível reproduzir este áudio agora.");
    }
  }

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(seconds, duration || seconds));
    audio.currentTime = next;
    setCurrentTime(next);
    if (hasEnded && next < duration) setHasEnded(false);
  }

  function skipBy(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    seekTo(audio.currentTime + seconds);
  }

  function setVolumeValue(value: number) {
    const next = Math.max(0, Math.min(value, 1));
    setVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
    storePreferences(next, loop);
  }

  function setLoopValue(value: boolean) {
    setLoop(value);
    if (audioRef.current) audioRef.current.loop = value;
    storePreferences(volume, value);
  }

  function closePlayer() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasEnded(false);
    setErrorMessage(null);
  }

  useEffect(() => {
    if (!("mediaSession" in navigator) || !track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: "Harmomus",
      album: "Kit vocal",
    });

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    try {
      navigator.mediaSession.setActionHandler("play", () => {
        void togglePlay();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        void togglePlay();
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => skipBy(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => skipBy(10));
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") seekTo(details.seekTime);
      });
    } catch {
      // Alguns navegadores não suportam todos os handlers.
    }
  }, [track, isPlaying, currentTime, duration]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !track || !duration) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: currentTime,
      });
    } catch {
      // Safari/iOS pode ignorar position state em alguns cenários.
    }
  }, [track, currentTime, duration]);

  const value = useMemo<GlobalAudioPlayerContextValue>(() => ({
    audioRef,
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    loop,
    hasEnded,
    errorMessage,
    preloadedSrc,
    preloadTrack,
    playTrack,
    togglePlay,
    replay,
    seekTo,
    skipBy,
    setVolumeValue,
    setLoopValue,
    closePlayer,
  }), [track, isPlaying, currentTime, duration, volume, loop, hasEnded, errorMessage, preloadedSrc]);

  return (
    <GlobalAudioPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onEnded={() => {
          setIsPlaying(false);
          if (!loop) setHasEnded(true);
        }}
        onError={() => setErrorMessage("Áudio indisponível ou acesso negado.")}
        className="hidden"
      />
      <audio ref={preloadAudioRef} preload="auto" className="hidden" aria-hidden="true" />
      <FloatingMiniPlayer />
    </GlobalAudioPlayerContext.Provider>
  );
}

function FloatingMiniPlayer() {
  const {
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    loop,
    hasEnded,
    errorMessage,
    togglePlay,
    replay,
    seekTo,
    skipBy,
    setVolumeValue,
    setLoopValue,
    closePlayer,
  } = useGlobalAudioPlayer();

  if (!track) return null;

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[80] mx-auto max-w-5xl rounded-2xl border border-white/15 bg-[#070a12]/95 p-3 text-white shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl md:bottom-5 md:p-4">
      <div className="absolute left-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-300" style={{ width: `${progress}%` }} />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{track.title}</p>
          <p className="mt-1 text-xs text-white/50">{hasEnded ? "Faixa finalizada" : `${formatTime(currentTime)} / ${formatTime(duration)}`}</p>
        </div>

        <div className="flex items-center justify-between gap-3 md:justify-center">
          <button type="button" onClick={() => skipBy(-10)} className="rounded-full border border-white/10 p-2 text-white/80 hover:bg-white/10">
            <RotateCcw size={18} />
          </button>

          <button type="button" onClick={hasEnded ? replay : togglePlay} className="rounded-full bg-cyan-300 p-3 text-black shadow-[0_0_30px_rgba(103,232,249,0.35)] hover:scale-[1.03]">
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>

          <button type="button" onClick={() => skipBy(10)} className="rounded-full border border-white/10 p-2 text-white/80 hover:bg-white/10">
            <RotateCw size={18} />
          </button>

          <button type="button" aria-pressed={loop} title={loop ? "Loop ligado" : "Loop desligado"} onClick={() => setLoopValue(!loop)} className={`rounded-full border p-2 hover:bg-white/10 ${loop ? "border-cyan-200/70 bg-cyan-300/15 text-cyan-200" : "border-white/10 text-white/70"}`}>
            <Repeat2 size={18} />
          </button>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Volume2 size={16} className="text-white/60" />
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolumeValue(Number(event.target.value))} className="w-28" />
        </div>

        <button type="button" onClick={closePlayer} className="absolute right-2 top-2 rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white md:static md:p-2">
          <X size={18} />
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={duration || 0}
        value={currentTime}
        onChange={(event) => seekTo(Number(event.target.value))}
        className="mt-3 w-full md:hidden"
      />

      {loop ? <p className="mt-2 text-xs text-cyan-200">Loop ligado: esta mesma faixa será repetida.</p> : null}
      {hasEnded ? <p className="mt-2 text-xs text-white/55">Clique em reproduzir para ouvir novamente.</p> : null}
      {errorMessage ? <p className="mt-2 text-xs text-amber-300">{errorMessage}</p> : null}
    </div>
  );
}

export function useGlobalAudioPlayer() {
  const context = useContext(GlobalAudioPlayerContext);
  if (!context) throw new Error("useGlobalAudioPlayer deve ser usado dentro de GlobalAudioPlayerProvider.");
  return context;
}
