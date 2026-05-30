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

function voiceLabel(voice: PlaylistTrackVoice | string | null | undefined) {
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

function firstVoice(voices: PlaylistTrackVoice[]) {
  return voices.includes("todos") ? "todos" : voices[0] ?? "";
}

function toneStatusLabel(source: "original" | "generated" | null | undefined) {
  return source === "original" ? "Original" : "Harmomus IA";
}

function friendlyPlaybackError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/not supported|no supported source|media|decode|failed/i.test(message)) {
    return "Não foi possível iniciar este áudio agora. Tente tocar novamente ou escolha outro tom/voz.";
  }
  if (/not allowed|interrupted|abort/i.test(message)) {
    return "A reprodução foi interrompida pelo navegador. Toque novamente para continuar.";
  }
  return "Não foi possível reproduzir este áudio agora.";
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
  const [playbackError, setPlaybackError] = useState<string | null>(null);

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
      pickTrack: (tracks) => {
        const exactVoice = selectedVoice ? tracks.find((track) => track.voice === selectedVoice) : null;
        return exactVoice ?? tracks.find((track) => track.voice === "todos") ?? tracks[0] ?? null;
      },
    });
  }, [currentKit, selectedTone, selectedVoice]);

  const sourceToneForVoices = toneResolution?.sourceTone ?? selectedTone;
  const voiceOptions = useMemo(() => currentKit ? getVoiceOptions(currentKit, sourceToneForVoices) : [], [currentKit, sourceToneForVoices]);
  const currentTrack: KitTrack | null = toneResolution?.sourceTrack ?? null;
  const playableTrack = toneResolution?.isAvailable ? currentTrack : null;
  const semitoneShift = toneResolution?.isPitchShifted ? toneResolution.semitoneShift : 0;
  const selectedSource = currentTrack?.sourceType ?? null;
  const isSelectedToneReal = selectedSource === "original";
  const canPlaySelectedTone = Boolean(playableTrack?.streamUrl);

  const activeTrackKey = useMemo(() => {
    return [
      playlist.id,
      currentKit?.id ?? "no-kit",
      selectedTone || "no-tone",
      selectedVoice || "no-voice",
      playableTrack?.id ?? "no-track",
      playableTrack?.streamUrl ?? "no-src",
      String(semitoneShift),
    ].join("::");
  }, [playlist.id, currentKit?.id, selectedTone, selectedVoice, playableTrack?.id, playableTrack?.streamUrl, semitoneShift]);

  function disposePitchController() {
    try {
      pitchControllerRef.current?.dispose();
    } catch (error) {
      console.error("[PlaylistPlayer] failed to dispose pitch controller", error);
    }
    pitchControllerRef.current = null;
  }

  function resetPlayback(nextSrc?: string | null) {
    pitchSessionRef.current += 1;
    disposePitchController();

    const audio = audioRef.current;
    if (audio) {
      try { audio.pause(); } catch {}
      try { audio.currentTime = 0; } catch {}

      if (nextSrc) {
        const currentSrc = audio.getAttribute("src") || audio.src || "";
        if (currentSrc !== nextSrc) {
          audio.src = nextSrc;
        }
      } else {
        audio.removeAttribute("src");
      }
    }

    setPlaybackError(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsLoadingPlayback(false);
  }

  useEffect(() => {
    setCurrentKitIndex(0);
    setSelectedTone("");
    setSelectedVoice("");
    resetPlayback(null);
  }, [playlist.id]);

  useEffect(() => {
    if (!currentKit) return;

    const nextTone = pickInitialTone({
      availableTones: realToneOptions,
      defaultTone: currentKit.default_tone,
      originalTone: currentKit.original_tone,
    });
    const voices = getVoiceOptions(currentKit, nextTone);

    setSelectedTone(nextTone);
    setSelectedVoice(firstVoice(voices));
    resetPlayback(null);
  }, [currentKitIndex, currentKit?.id]);

  useEffect(() => {
    resetPlayback(playableTrack?.streamUrl ?? null);
  }, [activeTrackKey]);

  useEffect(() => {
    return () => {
      resetPlayback(null);
    };
  }, []);

  function playKitAt(index: number) {
    if (index < 0 || index >= kits.length) return;
    setCurrentKitIndex(index);
    resetPlayback(null);
  }

  function next() {
    if (kits.length === 0) return;

    if (currentKitIndex >= kits.length - 1) {
      if (replayAtEnd) {
        setCurrentKitIndex(0);
      } else {
        resetPlayback(null);
      }
      return;
    }

    setCurrentKitIndex((prev) => prev + 1);
    resetPlayback(null);
  }

  function prev() {
    if (currentKitIndex <= 0) {
      setCurrentKitIndex(0);
      resetPlayback(null);
      return;
    }

    setCurrentKitIndex((prevIndex) => prevIndex - 1);
    resetPlayback(null);
  }

  async function togglePlay() {
    const audio = audioRef.current;
    const src = playableTrack?.streamUrl ?? null;
    if (!audio || !src || isLoadingPlayback) return;

    const currentSrc = audio.getAttribute("src") || audio.currentSrc || audio.src || "";
    if (currentSrc !== src) {
      resetPlayback(src);
      audio.src = src;
    }

    if (isPlaying) {
      try { pitchControllerRef.current?.pause(); } catch {}
      audio.pause();
      setIsPlaying(false);
      return;
    }

    const session = ++pitchSessionRef.current;

    try {
      setPlaybackError(null);
      setIsLoadingPlayback(true);

      if (semitoneShift === 0) {
        await audio.play();
        if (session === pitchSessionRef.current) setIsPlaying(true);
        return;
      }

      disposePitchController();
      const controller = await getPitchEngine().createPlayback({ audio, semitoneShift });

      if (session !== pitchSessionRef.current) {
        controller.dispose();
        return;
      }

      pitchControllerRef.current = controller;
      await controller.play();
      if (session === pitchSessionRef.current) setIsPlaying(true);
    } catch (error) {
      console.error("[PlaylistPlayer] playback failed", error);
      setPlaybackError(friendlyPlaybackError(error));
      setIsPlaying(false);
    } finally {
      setIsLoadingPlayback(false);
    }
  }

  function handleToneChange(tone: string) {
    if (!currentKit) return;

    const previewResolution = resolveToneTrack({
      tracks: currentKit.tracks,
      requestedTone: tone,
      allowPitchShift: currentKit.allow_pitch_shift,
      maxPitchShiftSemitones: currentKit.max_pitch_shift_semitones,
      pickTrack: (tracks) => {
        const exactVoice = selectedVoice ? tracks.find((track) => track.voice === selectedVoice) : null;
        return exactVoice ?? tracks.find((track) => track.voice === "todos") ?? tracks[0] ?? null;
      },
    });

    const voices = getVoiceOptions(currentKit, previewResolution?.sourceTone ?? tone);
    setSelectedTone(tone);
    setSelectedVoice(voices.includes(selectedVoice as PlaylistTrackVoice) ? selectedVoice : firstVoice(voices));
    resetPlayback(null);
  }

  function handleVoiceChange(voice: PlaylistTrackVoice) {
    setSelectedVoice(voice);
    resetPlayback(null);
  }

  if (!currentKit) {
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-6 text-white">Playlist vazia.</main>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8">
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          disposePitchController();
          next();
        }}
        onError={() => {
          setPlaybackError("Não foi possível carregar este áudio. Tente novamente ou escolha outro tom/voz.");
          setIsPlaying(false);
          setIsLoadingPlayback(false);
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

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-400">Tom</span>
                    <select
                      value={selectedTone}
                      onChange={(event) => handleToneChange(event.target.value)}
                      className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none"
                    >
                      {toneOptions.map((tone) => {
                        const optionResolution = currentKit ? resolveToneTrack({
                          tracks: currentKit.tracks,
                          requestedTone: tone,
                          allowPitchShift: currentKit.allow_pitch_shift,
                          maxPitchShiftSemitones: currentKit.max_pitch_shift_semitones,
                          pickTrack: (tracks) => tracks.find((item) => item.voice === selectedVoice) ?? tracks.find((item) => item.voice === "todos") ?? tracks[0] ?? null,
                        }) : null;
                        const optionTrack = optionResolution?.sourceTrack ?? null;
                        return <option key={tone} value={tone}>{tone} • {toneStatusLabel(optionTrack?.sourceType)}</option>;
                      })}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-400">Voz / Nipe</span>
                    <select
                      value={selectedVoice}
                      onChange={(event) => handleVoiceChange(event.target.value as PlaylistTrackVoice)}
                      className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none"
                    >
                      {voiceOptions.map((voice) => <option key={voice} value={voice}>{voiceLabel(voice)}</option>)}
                    </select>
                  </label>
                </div>

                <p className="mt-4 text-sm text-zinc-300">
                  Áudio selecionado: {currentTrack ? `${selectedTone} • ${voiceLabel(currentTrack.voice)}` : "Indisponível"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Tom original: {currentKit.original_tone ?? "não informado"} • Tom inicial: {currentKit.default_tone ?? currentKit.original_tone ?? "automático"}
                </p>
                {toneResolution?.isPitchShifted ? (
                  <p className="mt-2 rounded-xl border border-gold-400/20 bg-gold-400/10 px-3 py-2 text-xs text-gold-200">
                    Harmomus AI: usando {toneResolution.sourceTone} {toneResolution.semitoneShift > 0 ? `+${toneResolution.semitoneShift}` : toneResolution.semitoneShift} semitom(ns).
                  </p>
                ) : null}
                {!toneResolution?.isAvailable && selectedTone ? (
                  <p className="mt-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">
                    Este tom ainda não está disponível para este kit dentro do limite configurado.
                  </p>
                ) : null}
                {playbackError ? (
                  <p className="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                    {playbackError}
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
                  <button onClick={togglePlay} disabled={!canPlaySelectedTone || isLoadingPlayback} className="rounded-full border border-gold-400/50 bg-black/40 p-4 text-white disabled:cursor-not-allowed disabled:opacity-40">
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button onClick={next} className="rounded-full border border-white/20 p-3 text-white"><SkipForward size={18} /></button>
                  <button onClick={() => setReplayAtEnd((value) => !value)} className={`rounded-full border px-4 py-2 text-sm ${replayAtEnd ? "border-gold-300 text-gold-300" : "border-white/20 text-zinc-200"}`}>
                    Replay {replayAtEnd ? "ON" : "OFF"}
                  </button>
                  <span className="text-xs text-zinc-400">{isSelectedToneReal ? "Original" : "Harmomus IA"}</span>
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
