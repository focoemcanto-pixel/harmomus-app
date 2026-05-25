"use client";

import Link from "next/link";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPitchEngine, type PitchPlaybackController } from "@/lib/audio/pitch-engine";
import { midiToNoteName } from "@/lib/audio/pitch-analysis";

import type { PlaylistKitSummary, PlaylistTrackVoice, PublicPlaylist } from "@/lib/data/playlists";
import { analyzeTessitura } from "@/lib/music/tessitura";
import { CHROMATIC_TONES_SHARP, pickInitialTone, resolveToneTrack } from "@/lib/music/tones";

interface PlaylistPlayerClientProps {
  playlist: PublicPlaylist;
}

type KitTrack = PlaylistKitSummary["tracks"][number];

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function voiceLabel(voice: PlaylistTrackVoice | string | null) {
  if (!voice) return "Todos";
  const map: Record<string, string> = {
    todos: "Todos",
    tenor: "Tenor",
    contralto: "Contralto",
    soprano: "Soprano",
    baritono: "Barítono",
  };
  return map[voice] ?? voice;
}

function getRealToneOptions(kit: PlaylistKitSummary) {
  return Array.from(new Set(kit.tracks.map((track) => track.tone).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function getSelectableToneOptions(kit: PlaylistKitSummary) {
  return kit.allow_pitch_shift ? [...CHROMATIC_TONES_SHARP] : getRealToneOptions(kit);
}

function getVoiceOptions(kit: PlaylistKitSummary, tone: string) {
  return Array.from(new Set(kit.tracks.filter((track) => !tone || track.tone === tone).map((track) => track.voice).filter(Boolean))) as PlaylistTrackVoice[];
}

function findTrack(kit: PlaylistKitSummary, tone: string, voice: PlaylistTrackVoice | "") {
  return kit.tracks.find((track) => track.tone === tone && track.voice === voice) ?? kit.tracks.find((track) => track.tone === tone) ?? kit.tracks[0] ?? null;
}

function toneStatusLabel(isReal: boolean) {
  return isReal ? "gravado" : "Harmomus AI";
}

function tessituraStatusLabel(status: string) {
  const map: Record<string, string> = {
    comfortable: "Confortável",
    extended: "Estendida",
    extreme: "Extrema",
    unsafe: "Fora da zona segura",
  };
  return map[status] ?? status;
}

function getTrackMidiRange(track: KitTrack | null) {
  if (!track) return null;
  const min = track.minMidiNote ?? track.detectedMinMidiNote;
  const max = track.maxMidiNote ?? track.detectedMaxMidiNote;
  if (typeof min !== "number" || typeof max !== "number") return null;
  return { min, max };
}

export function PlaylistPlayerClient({ playlist }: PlaylistPlayerClientProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pitchControllerRef = useRef<PitchPlaybackController | null>(null);
  const pitchSessionRef = useRef(0);

  const [currentKitIndex, setCurrentKitIndex] = useState(0);
  const [selectedTone, setSelectedTone] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<PlaylistTrackVoice | "">("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [replayAtEnd, setReplayAtEnd] = useState(false);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);

  const kits = playlist.kits;
  const currentKit = kits[currentKitIndex] ?? null;

  const realToneOptions = useMemo(() => currentKit ? getRealToneOptions(currentKit) : [], [currentKit]);
  const toneOptions = useMemo(() => currentKit ? getSelectableToneOptions(currentKit) : [], [currentKit]);

  const toneResolution = useMemo(() => {
    if (!currentKit || !selectedTone) return null;
    return resolveToneTrack({
      tracks: currentKit.tracks,
      requestedTone: selectedTone,
      allowPitchShift: currentKit.allow_pitch_shift,
      maxPitchShiftSemitones: currentKit.max_pitch_shift_semitones,
      pickTrack: (tracks) => tracks.find((track) => track.voice === selectedVoice) ?? tracks.find((track) => track.voice === "todos") ?? tracks[0] ?? null,
    });
  }, [currentKit, selectedTone, selectedVoice]);

  const sourceToneForVoices = toneResolution?.sourceTone ?? selectedTone;
  const voiceOptions = useMemo(() => currentKit ? getVoiceOptions(currentKit, sourceToneForVoices) : [], [currentKit, sourceToneForVoices]);
  const currentTrack = toneResolution?.sourceTrack ?? (currentKit ? findTrack(currentKit, selectedTone, selectedVoice) : null);
  const playableTrack = toneResolution?.isAvailable ? currentTrack : null;
  const semitoneShift = toneResolution?.isPitchShifted ? toneResolution.semitoneShift : 0;

  const tessituraAnalysis = useMemo(() => {
    if (!toneResolution?.sourceTone || !selectedTone) return null;
    const range = getTrackMidiRange(currentTrack);
    if (!range) return null;

    return analyzeTessitura({
      requestedTone: selectedTone,
      sourceTone: toneResolution.sourceTone,
      sourceMinMidi: range.min,
      sourceMaxMidi: range.max,
    });
  }, [currentTrack, selectedTone, toneResolution?.sourceTone]);

  function disposePitchController() {
    try {
      pitchControllerRef.current?.dispose();
    } catch (error) {
      console.error("[PlaylistPlayer] failed to dispose pitch controller", error);
    }
    pitchControllerRef.current = null;
  }

  useEffect(() => {
    setCurrentKitIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [playlist.id]);

  useEffect(() => {
    if (!currentKit) return;
    const nextTone = pickInitialTone({
      availableTones: realToneOptions,
      defaultTone: currentKit.default_tone,
      originalTone: currentKit.original_tone,
    });
    const voices = getVoiceOptions(currentKit, nextTone);
    const preferredVoice = voices.includes("todos") ? "todos" : voices[0] ?? "";
    setSelectedTone(nextTone);
    setSelectedVoice(preferredVoice);
    setCurrentTime(0);
    setDuration(0);
  }, [currentKitIndex, currentKit, realToneOptions]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    pitchSessionRef.current += 1;
    disposePitchController();

    audio.pause();
    audio.currentTime = 0;

    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsLoadingPlayback(false);
  }, [playableTrack?.id, semitoneShift]);

  useEffect(() => {
    return () => {
      disposePitchController();
    };
  }, []);

  const playKitAt = (index: number) => {
    if (index < 0 || index >= kits.length) return;
    setCurrentKitIndex(index);
    setIsPlaying(false);
  };

  const next = () => {
    if (kits.length === 0) return;

    if (currentKitIndex >= kits.length - 1) {
      if (replayAtEnd) {
        setCurrentKitIndex(0);
        setIsPlaying(false);
      } else {
        setIsPlaying(false);
      }
      return;
    }

    setCurrentKitIndex((prev) => prev + 1);
    setIsPlaying(false);
  };

  const prev = () => {
    if (currentKitIndex <= 0) {
      setCurrentKitIndex(0);
      setIsPlaying(false);
      return;
    }

    setCurrentKitIndex((prevIndex) => prevIndex - 1);
    setIsPlaying(false);
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !playableTrack?.streamUrl || isLoadingPlayback) return;

    if (semitoneShift === 0) {
      try {
        if (audio.paused) {
          setIsLoadingPlayback(true);
          await audio.play();
          setIsPlaying(true);
        } else {
          audio.pause();
          setIsPlaying(false);
        }
      } catch {
        setIsPlaying(false);
      } finally {
        setIsLoadingPlayback(false);
      }
      return;
    }

    const session = ++pitchSessionRef.current;

    try {
      setIsLoadingPlayback(true);

      if (!pitchControllerRef.current) {
        const engine = getPitchEngine();
        const controller = await engine.createPlayback({ audio, semitoneShift });

        if (session !== pitchSessionRef.current) {
          controller.dispose();
          return;
        }

        pitchControllerRef.current = controller;
      } else {
        pitchControllerRef.current.setSemitoneShift(semitoneShift);
      }

      if (isPlaying) {
        pitchControllerRef.current.pause();
        setIsPlaying(false);
      } else {
        await pitchControllerRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("[PlaylistPlayer] pitch engine failed, falling back to native", error);

      disposePitchController();

      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } finally {
      setIsLoadingPlayback(false);
    }
  };

  if (!currentKit) {
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-6 text-white">Playlist vazia.</main>;
  }

  const isSelectedToneReal = realToneOptions.includes(selectedTone);
  const canPlaySelectedTone = Boolean(playableTrack?.streamUrl);
  const trackMidiRange = getTrackMidiRange(currentTrack);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8">
      <audio
        ref={audioRef}
        src={playableTrack?.streamUrl ?? undefined}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          disposePitchController();
          next();
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        className="hidden"
      />

      <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900/95 to-zinc-800/60 p-5 shadow-premium md:p-7">
          <p className="text-sm text-zinc-300">Playlist pública</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">{playlist.name}</h1>

          <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
            <img src={currentKit.cover_url ?? "https://placehold.co/800x800/101114/f4f4f5?text=Harmomus"} alt={currentKit.name} className="aspect-square w-full rounded-2xl border border-white/10 object-cover" />
            <div className="flex flex-col justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Tocando agora</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{currentKit.name}</h2>
                <p className="text-zinc-300">{currentKit.artist}</p>
                <p className="mt-2 text-sm text-gold-300">{currentKit.category?.name ?? "Sem categoria"}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
