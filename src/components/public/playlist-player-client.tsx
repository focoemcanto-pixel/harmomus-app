"use client";

import Link from "next/link";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPitchEngine, type PitchPlaybackController } from "@/lib/audio/pitch-engine";

import type { PlaylistKitSummary, PlaylistTrackVoice, PublicPlaylist } from "@/lib/data/playlists";
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

export function PlaylistPlayerClient({ playlist }: PlaylistPlayerClientProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentKitIndex, setCurrentKitIndex] = useState(0);
  const [selectedTone, setSelectedTone] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<PlaylistTrackVoice | "">("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [replayAtEnd, setReplayAtEnd] = useState(false);
  const pitchControllerRef = useRef<PitchPlaybackController | null>(null);

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
    pitchControllerRef.current?.dispose();
    pitchControllerRef.current = null;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);
  }, [playableTrack?.id, semitoneShift]);

  const playKitAt = (index: number) => {
    if (index < 0 || index >= kits.length) return;
    setCurrentKitIndex(index);
    setIsPlaying(true);
  };

  const next = () => {
    if (kits.length === 0) return;
    if (currentKitIndex >= kits.length - 1) {
      if (replayAtEnd) {
        setCurrentKitIndex(0);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
      return;
    }
    setCurrentKitIndex((prev) => prev + 1);
    setIsPlaying(true);
  };

  const prev = () => {
    if (currentKitIndex <= 0) {
      setCurrentKitIndex(0);
      return;
    }
    setCurrentKitIndex((prevIndex) => prevIndex - 1);
    setIsPlaying(true);
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !playableTrack?.streamUrl) return;

    if (semitoneShift === 0) {
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
      return;
    }

    try {
      if (!pitchControllerRef.current) {
        const engine = getPitchEngine();
        pitchControllerRef.current = await engine.createPlayback({ audio, semitoneShift });
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
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };
  useEffect(() => {
    return () => {
      pitchControllerRef.current?.dispose();
      pitchControllerRef.current = null;
    };
  }, []);


  if (!currentKit) {
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-6 text-white">Playlist vazia.</main>;
  }

  const isSelectedToneReal = realToneOptions.includes(selectedTone);
  const canPlaySelectedTone = Boolean(playableTrack?.streamUrl);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8">
      <audio
        ref={audioRef}
        src={playableTrack?.streamUrl ?? undefined}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => { pitchControllerRef.current?.dispose(); pitchControllerRef.current = null; next(); }}
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

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-400">Tom</span>
                    <select
                      value={selectedTone}
                      onChange={(event) => {
                        const tone = event.target.value;
                        const previewResolution = currentKit ? resolveToneTrack({
                          tracks: currentKit.tracks,
                          requestedTone: tone,
                          allowPitchShift: currentKit.allow_pitch_shift,
                          maxPitchShiftSemitones: currentKit.max_pitch_shift_semitones,
                        }) : null;
                        const voices = currentKit ? getVoiceOptions(currentKit, previewResolution?.sourceTone ?? tone) : [];
                        setSelectedTone(tone);
                        setSelectedVoice(voices.includes(selectedVoice as PlaylistTrackVoice) ? selectedVoice : voices.includes("todos") ? "todos" : voices[0] ?? "");
                        setIsPlaying(false);
                      }}
                      className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none"
                    >
                      {toneOptions.map((tone) => {
                        const isReal = realToneOptions.includes(tone);
                        return <option key={tone} value={tone}>{tone} • {toneStatusLabel(isReal)}</option>;
                      })}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-400">Voz / Nipe</span>
                    <select
                      value={selectedVoice}
                      onChange={(event) => {
                        setSelectedVoice(event.target.value as PlaylistTrackVoice);
                        setIsPlaying(false);
                      }}
                      className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none"
                    >
                      {voiceOptions.map((voice) => <option key={voice} value={voice}>{voiceLabel(voice)}</option>)}
                    </select>
                  </label>
                </div>

                <p className="mt-4 text-sm text-zinc-300">Áudio selecionado: {currentTrack ? `${selectedTone} • ${voiceLabel(currentTrack.voice)}` : "Indisponível"}</p>
                <p className="mt-1 text-xs text-zinc-500">Tom original: {currentKit.original_tone ?? "não informado"} • Tom inicial: {currentKit.default_tone ?? currentKit.original_tone ?? "automático"}</p>
                {toneResolution?.isPitchShifted ? (
                  <p className="mt-2 rounded-xl border border-gold-400/20 bg-gold-400/10 px-3 py-2 text-xs text-gold-200">
                    Tom Harmomus AI preparado: usar {toneResolution.sourceTone} {toneResolution.semitoneShift > 0 ? `+${toneResolution.semitoneShift}` : toneResolution.semitoneShift} semitom(ns). O processamento de áudio será ativado na próxima camada.
                  </p>
                ) : null}
                {!toneResolution?.isAvailable && selectedTone ? (
                  <p className="mt-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                    Este tom ainda não está disponível para este kit dentro do limite configurado.
                  </p>
                ) : null}
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
                  <button onClick={togglePlay} disabled={!canPlaySelectedTone} className="rounded-full border border-gold-400/50 bg-black/40 p-4 text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button onClick={next} className="rounded-full border border-white/20 p-3 text-white"><SkipForward size={18} /></button>
                  <button onClick={() => setReplayAtEnd((v) => !v)} className={`rounded-full border px-4 py-2 text-sm ${replayAtEnd ? "border-gold-300 text-gold-300" : "border-white/20 text-zinc-200"}`}>
                    Replay {replayAtEnd ? "ON" : "OFF"}
                  </button>
                  {!isSelectedToneReal ? <span className="text-xs text-zinc-400">Harmomus AI com pitch shifting em tempo real.</span> : null}
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
          <p className="mt-1 text-xs text-zinc-400">A fila mostra apenas os kits. Tom e voz são escolhidos no player.</p>
          <div className="mt-4 space-y-2">
            {kits.map((kit, index) => (
              <button
                key={kit.id}
                onClick={() => playKitAt(index)}
                className={`grid w-full grid-cols-[52px_1fr] gap-3 rounded-xl p-2 text-left transition ${index === currentKitIndex ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
              >
                <img src={kit.cover_url ?? "https://placehold.co/120x120/101114/f4f4f5?text=Kit"} alt={kit.name} className="h-12 w-12 rounded-lg object-cover" />
                <div>
                  <p className="line-clamp-1 text-sm text-white">{kit.name}</p>
                  <p className="line-clamp-1 text-xs text-zinc-300">{kit.artist}</p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
