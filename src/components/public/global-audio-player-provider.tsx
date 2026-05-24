"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";

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
  errorMessage: string | null;
  playTrack: (track: GlobalTrack) => Promise<void>;
  togglePlay: () => Promise<void>;
  seekTo: (seconds: number) => void;
  skipBy: (seconds: number) => void;
  setVolumeValue: (value: number) => void;
  setLoopValue: (value: boolean) => void;
};

const GlobalAudioPlayerContext = createContext<GlobalAudioPlayerContextValue | null>(null);

export function GlobalAudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<GlobalTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [loop, setLoop] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function playTrack(nextTrack: GlobalTrack) {
    const audio = audioRef.current;
    if (!audio) return;

    setErrorMessage(null);

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

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Math.max(0, Math.min(seconds, duration || seconds));
    audio.currentTime = next;
    setCurrentTime(next);
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
  }

  function setLoopValue(value: boolean) {
    setLoop(value);
    if (audioRef.current) audioRef.current.loop = value;
  }

  const value = useMemo<GlobalAudioPlayerContextValue>(() => ({
    audioRef,
    track,
    isPlaying,
    currentTime,
    duration,
    volume,
    loop,
    errorMessage,
    playTrack,
    togglePlay,
    seekTo,
    skipBy,
    setVolumeValue,
    setLoopValue,
  }), [track, isPlaying, currentTime, duration, volume, loop, errorMessage]);

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
        onEnded={() => setIsPlaying(false)}
        onError={() => setErrorMessage("Áudio indisponível ou acesso negado.")}
        className="hidden"
      />
    </GlobalAudioPlayerContext.Provider>
  );
}

export function useGlobalAudioPlayer() {
  const context = useContext(GlobalAudioPlayerContext);
  if (!context) throw new Error("useGlobalAudioPlayer deve ser usado dentro de GlobalAudioPlayerProvider.");
  return context;
}
