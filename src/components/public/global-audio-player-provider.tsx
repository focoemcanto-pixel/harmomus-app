"use client";

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

function readStoredPreferences() {
  if (typeof window === "undefined") return { volume: 1, loop: false };

  try {
    const raw = window.localStorage.getItem(PLAYER_PREFS_KEY);

    if (!raw) {
      return { volume: 1, loop: false };
    }

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
    // ignore
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
        if (hasEnded) {
          audio.currentTime = 0;
        }

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

    if (hasEnded && next < duration) {
      setHasEnded(false);
    }
  }

  function skipBy(seconds: number) {
    const audio = audioRef.current;

    if (!audio) return;

    seekTo(audio.currentTime + seconds);
  }

  function setVolumeValue(value: number) {
    const next = Math.max(0, Math.min(value, 1));

    setVolume(next);

    if (audioRef.current) {
      audioRef.current.volume = next;
    }

    storePreferences(next, loop);
  }

  function setLoopValue(value: boolean) {
    setLoop(value);

    if (audioRef.current) {
      audioRef.current.loop = value;
    }

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

          if (!loop) {
            setHasEnded(true);
          }
        }}
        onError={() => setErrorMessage("Áudio indisponível ou acesso negado.")}
        className="hidden"
      />

      <audio
        ref={preloadAudioRef}
        preload="auto"
        className="hidden"
        aria-hidden="true"
      />
    </GlobalAudioPlayerContext.Provider>
  );
}

export function useGlobalAudioPlayer() {
  const context = useContext(GlobalAudioPlayerContext);

  if (!context) {
    throw new Error("useGlobalAudioPlayer deve ser usado dentro de GlobalAudioPlayerProvider.");
  }

  return context;
}
