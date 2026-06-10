"use client";

import Link from "next/link";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { getPitchEngine, type PitchPlaybackController } from "@/lib/audio/pitch-engine";
import type { PlaylistKitSummary, PlaylistTrackVoice, PublicPlaylist } from "@/lib/data/playlists";
import { CHROMATIC_TONES_SHARP, pickInitialTone, resolveToneTrack } from "@/lib/music/tones";
import {
  DEFAULT_PLAYLIST_STUDY_SETTINGS,
  getDefaultStudyTone,
  getStudyToneOptions,
  loadPlaylistStudySettings,
  resolveStudyTrackForItem,
  savePlaylistStudySettings,
  type PlaylistStudySettings,
  type StudyVoice,
} from "@/lib/playlist-study-mode";

interface PlaylistPlayerClientProps {
  playlist: PublicPlaylist;
}

type KitTrack = PlaylistKitSummary["tracks"][number];
type PlaybackMetric = {
  id: string;
  src: string;
  clickAt: number;
  fetchStartAt?: number;
  fetchEndAt?: number;
  canplayAt?: number;
  playingAt?: number;
};

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function voiceLabel(voice: PlaylistTrackVoice | StudyVoice | string | null | undefined) {
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

const STUDY_VOICE_OPTIONS: StudyVoice[] = ["todos", "tenor", "contralto", "soprano"];

function toneStatusLabel(source: "original" | "generated" | null | undefined) {
  return source === "original" ? "Original" : "Harmomus IA";
}

function nowPerf() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function readResourceResponseEnd(src: string, fallback: number) {
  if (typeof performance === "undefined" || typeof performance.getEntriesByName !== "function") return fallback;
  const entries = performance.getEntriesByName(src, "resource") as PerformanceResourceTiming[];
  const latest = entries.at(-1);
  return latest?.responseEnd && latest.responseEnd > 0 ? latest.responseEnd : fallback;
}

function logPlaybackMetric(metric: PlaybackMetric, event: "PLAY_CLICK" | "FETCH_AUDIO_START" | "FETCH_AUDIO_END" | "AUDIO_CANPLAY" | "AUDIO_PLAYING") {
  const fetchStartAt = metric.fetchStartAt ?? metric.clickAt;
  const fetchEndAt = metric.fetchEndAt ?? metric.canplayAt ?? metric.playingAt;
  const canplayAt = metric.canplayAt ?? metric.playingAt;
  const playingAt = metric.playingAt;
  console.info(`[PlaylistPlayer:perf] ${event}`, {
    id: metric.id,
    src: metric.src,
    clickToFetchMs: Math.round(fetchStartAt - metric.clickAt),
    fetchToResponseMs: fetchEndAt ? Math.round(fetchEndAt - fetchStartAt) : null,
    responseToCanplayMs: fetchEndAt && canplayAt ? Math.round(canplayAt - fetchEndAt) : null,
    canplayToPlayingMs: canplayAt && playingAt ? Math.round(playingAt - canplayAt) : null,
    totalMs: playingAt ? Math.round(playingAt - metric.clickAt) : null,
  });
}

function createAudioElement(preload: "metadata" | "auto") {
  const audio = new Audio();
  audio.preload = preload;
  audio.setAttribute("playsinline", "true");
  return audio;
}

function stopAudioElement(audio: HTMLAudioElement | null | undefined, options: { resetTime?: boolean; clearSource?: boolean } = {}) {
  if (!audio) return;
  try { audio.pause(); } catch {}
  if (options.resetTime !== false) {
    try { audio.currentTime = 0; } catch {}
  }
  if (options.clearSource) {
    try { audio.removeAttribute("src"); } catch {}
    try { audio.load(); } catch {}
  }
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
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const playbackMetricRef = useRef<PlaybackMetric | null>(null);
  const pitchControllerRef = useRef<PitchPlaybackController | null>(null);
  const pitchSessionRef = useRef(0);
  const progressSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [currentKitIndex, setCurrentKitIndex] = useState(0);
  const [selectedTone, setSelectedTone] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<PlaylistTrackVoice | "">("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [replayAtEnd, setReplayAtEnd] = useState(false);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [studySettings, setStudySettings] = useState<PlaylistStudySettings>(DEFAULT_PLAYLIST_STUDY_SETTINGS);
  const [studyDraft, setStudyDraft] = useState<PlaylistStudySettings>(DEFAULT_PLAYLIST_STUDY_SETTINGS);
  const [studySaveMessage, setStudySaveMessage] = useState<string | null>(null);
  const autoPlayNextRef = useRef(false);

  const kits = playlist.kits;
  const currentKit = kits[currentKitIndex] ?? null;

  const realToneOptions = useMemo(() => currentKit ? getRealToneOptions(currentKit) : [], [currentKit]);
  const toneOptions = useMemo(() => currentKit ? getSelectableToneOptions(currentKit) : [], [currentKit]);

  const isStudyModeEnabled = studySettings.enabled;
  const activeTone = isStudyModeEnabled && currentKit ? studySettings.tonesByItem[currentKit.id] || getDefaultStudyTone(currentKit) || selectedTone : selectedTone;
  const activeVoice = isStudyModeEnabled ? studySettings.voice : selectedVoice;

  const toneResolution = useMemo(() => {
    if (!currentKit) return null;

    if (isStudyModeEnabled) {
      return resolveStudyTrackForItem(currentKit, studySettings);
    }

    if (!selectedTone) return null;
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
  }, [currentKit, isStudyModeEnabled, selectedTone, selectedVoice, studySettings]);

  const sourceToneForVoices = toneResolution?.sourceTone ?? activeTone;
  const voiceOptions = useMemo(() => currentKit ? getVoiceOptions(currentKit, sourceToneForVoices) : [], [currentKit, sourceToneForVoices]);
  const currentTrack: KitTrack | null = toneResolution?.sourceTrack ?? null;
  const playableTrack = toneResolution?.isAvailable ? currentTrack : null;
  const semitoneShift = toneResolution?.isPitchShifted ? toneResolution.semitoneShift : 0;
  const selectedSource = currentTrack?.sourceType ?? null;
  const isSelectedToneReal = selectedSource === "original";
  const canPlaySelectedTone = Boolean(playableTrack?.streamUrl);

  const nextPlayableTrack = useMemo(() => {
    if (kits.length <= 1) return null;
    const nextKit = kits[currentKitIndex + 1] ?? (replayAtEnd ? kits[0] : null);
    if (!nextKit) return null;

    if (isStudyModeEnabled) {
      const resolution = resolveStudyTrackForItem(nextKit, studySettings);
      return resolution?.isAvailable ? resolution.sourceTrack : null;
    }

    if (!selectedTone) return null;
    const resolution = resolveToneTrack({
      tracks: nextKit.tracks,
      requestedTone: selectedTone,
      allowPitchShift: nextKit.allow_pitch_shift,
      maxPitchShiftSemitones: nextKit.max_pitch_shift_semitones,
      pickTrack: (tracks) => tracks.find((track) => track.voice === selectedVoice) ?? tracks.find((track) => track.voice === "todos") ?? tracks[0] ?? null,
    });
    return resolution?.isAvailable ? resolution.sourceTrack : null;
  }, [currentKitIndex, isStudyModeEnabled, kits, replayAtEnd, selectedTone, selectedVoice, studySettings]);

  const activeTrackKey = useMemo(() => {
    return [
      playlist.id,
      currentKit?.id ?? "no-kit",
      activeTone || "no-tone",
      activeVoice || "no-voice",
      playableTrack?.id ?? "no-track",
      playableTrack?.streamUrl ?? "no-src",
      String(semitoneShift),
    ].join("::");
  }, [playlist.id, currentKit?.id, activeTone, activeVoice, playableTrack?.id, playableTrack?.streamUrl, semitoneShift]);


  function ensureStudyDefaults(settings: PlaylistStudySettings): PlaylistStudySettings {
    const tonesByItem = { ...settings.tonesByItem };
    for (const kit of kits) {
      if (!tonesByItem[kit.id]) {
        tonesByItem[kit.id] = getDefaultStudyTone(kit) || getStudyToneOptions(kit)[0] || "";
      }
    }

    return {
      enabled: settings.enabled,
      voice: settings.voice,
      tonesByItem,
    };
  }

  function handleStudyToneChange(kitId: string, tone: string) {
    setStudyDraft((current) => ({
      ...current,
      tonesByItem: { ...current.tonesByItem, [kitId]: tone },
    }));
    setStudySaveMessage(null);
  }

  function saveStudyMode() {
    const nextSettings = ensureStudyDefaults(studyDraft);
    savePlaylistStudySettings(playlist.id, nextSettings);
    setStudySettings(nextSettings);
    setStudyDraft(nextSettings);
    setStudySaveMessage("Modo Estudo salvo neste dispositivo.");
    resetPlayback(playableTrack?.streamUrl ?? null);
  }

  function disposePitchController() {
    try {
      pitchControllerRef.current?.dispose();
    } catch (error) {
      console.error("[PlaylistPlayer] failed to dispose pitch controller", error);
    }
    pitchControllerRef.current = null;
  }

  function syncProgressFromAudio(audio = audioRef.current) {
    if (!audio) return;
    const nextTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    setCurrentTime(nextTime);
    setDuration(nextDuration);
  }

  function stopProgressSync() {
    if (progressSyncTimerRef.current) {
      clearInterval(progressSyncTimerRef.current);
      progressSyncTimerRef.current = null;
    }
  }

  function startProgressSync(audio = audioRef.current) {
    stopProgressSync();
    syncProgressFromAudio(audio);
    progressSyncTimerRef.current = setInterval(() => {
      syncProgressFromAudio(audio);
    }, 250);
  }

  function stopAllAudio(options: { clearCurrentSource?: boolean; clearCacheSources?: boolean } = {}) {
    stopProgressSync();
    stopAudioElement(audioRef.current, { clearSource: options.clearCurrentSource });
    stopAudioElement(preloadAudioRef.current, { clearSource: options.clearCacheSources });

    audioCacheRef.current.forEach((audio) => {
      stopAudioElement(audio, { clearSource: options.clearCacheSources });
    });
  }

  function resetPlayback(nextSrc?: string | null) {
    pitchSessionRef.current += 1;
    disposePitchController();
    playbackMetricRef.current = null;

    stopAllAudio({ clearCurrentSource: !nextSrc });

    const audio = audioRef.current;
    if (audio) {
      if (nextSrc) {
        const currentSrc = audio.getAttribute("src") || audio.src || "";
        if (currentSrc !== nextSrc) {
          audio.src = nextSrc;
          audio.load();
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
    const loadedSettings = loadPlaylistStudySettings(playlist.id);
    setStudySettings(loadedSettings);
    setStudyDraft(ensureStudyDefaults(loadedSettings));
    setStudySaveMessage(null);
    setCurrentKitIndex(0);
    setSelectedTone("");
    setSelectedVoice("");
    resetPlayback(null);
  }, [playlist.id]);

  useEffect(() => {
    setStudyDraft((current) => ensureStudyDefaults(current));
    setStudySettings((current) => ensureStudyDefaults(current));
  }, [playlist.id, kits]);

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
    if (autoPlayNextRef.current && playableTrack?.streamUrl) {
      autoPlayNextRef.current = false;
      window.setTimeout(() => { void startPlayback(); }, 0);
    }
  }, [activeTrackKey]);

  useEffect(() => {
    const src = playableTrack?.streamUrl;
    if (!src || semitoneShift !== 0) return;
    let audio = audioCacheRef.current.get(activeTrackKey);
    if (!audio) {
      audio = createAudioElement("auto");
      audio.src = src;
      audioCacheRef.current.set(activeTrackKey, audio);
    }
    audio.preload = "auto";
    audio.load();
    audioRef.current = audio;
    syncProgressFromAudio(audio);
  }, [activeTrackKey, playableTrack?.streamUrl, semitoneShift]);

  useEffect(() => {
    const src = nextPlayableTrack?.streamUrl;
    if (!src) return;
    const preloadKey = `next::${nextPlayableTrack.id}::${src}`;
    let audio = audioCacheRef.current.get(preloadKey);
    if (!audio) {
      audio = createAudioElement("metadata");
      audio.src = src;
      audioCacheRef.current.set(preloadKey, audio);
    }
    audio.preload = "metadata";
    preloadAudioRef.current = audio;
    audio.load();
  }, [nextPlayableTrack?.id, nextPlayableTrack?.streamUrl]);

  useEffect(() => {
    return () => {
      resetPlayback(null);
      stopProgressSync();
      stopAllAudio({ clearCurrentSource: true, clearCacheSources: true });
      audioCacheRef.current.clear();
    };
  }, []);

  function playKitAt(index: number) {
    if (index < 0 || index >= kits.length) return;
    resetPlayback(null);
    setCurrentKitIndex(index);
  }

  function next() {
    if (kits.length === 0) return;

    if (currentKitIndex >= kits.length - 1) {
      if (replayAtEnd) {
        resetPlayback(null);
        setCurrentKitIndex(0);
      } else {
        resetPlayback(null);
      }
      return;
    }

    resetPlayback(null);
    setCurrentKitIndex((prev) => prev + 1);
  }

  function prev() {
    if (currentKitIndex <= 0) {
      setCurrentKitIndex(0);
      resetPlayback(null);
      return;
    }

    resetPlayback(null);
    setCurrentKitIndex((prevIndex) => prevIndex - 1);
  }

  async function startPlayback() {
    let audio = audioRef.current;
    const src = playableTrack?.streamUrl ?? null;
    if (!src || isLoadingPlayback) return;

    const cachedAudio = semitoneShift === 0 ? audioCacheRef.current.get(activeTrackKey) : null;
    if (cachedAudio) {
      audio = cachedAudio;
      audioRef.current = cachedAudio;
    }
    if (!audio) {
      audio = createAudioElement("auto");
      audioRef.current = audio;
      if (semitoneShift === 0) audioCacheRef.current.set(activeTrackKey, audio);
    }

    const currentSrc = audio.getAttribute("src") || audio.currentSrc || audio.src || "";
    if (currentSrc !== src) {
      resetPlayback(src);
      audio.src = src;
    }


    audio.onended = () => {
      stopProgressSync();
      disposePitchController();
      if (currentKitIndex < kits.length - 1 || replayAtEnd) autoPlayNextRef.current = true;
      next();
    };
    audio.onerror = () => {
      stopProgressSync();
      setPlaybackError("Não foi possível carregar este áudio. Tente novamente ou escolha outro tom/voz.");
      setIsPlaying(false);
      setIsLoadingPlayback(false);
    };

    const metric: PlaybackMetric = { id: activeTrackKey, src, clickAt: nowPerf() };
    playbackMetricRef.current = metric;
    logPlaybackMetric(metric, "PLAY_CLICK");

    const session = ++pitchSessionRef.current;
    metric.fetchStartAt = nowPerf();
    logPlaybackMetric(metric, "FETCH_AUDIO_START");
    const onCanPlay = () => {
      if (playbackMetricRef.current !== metric) return;
      metric.fetchEndAt = readResourceResponseEnd(src, nowPerf());
      metric.canplayAt = nowPerf();
      syncProgressFromAudio(audio);
      logPlaybackMetric(metric, "FETCH_AUDIO_END");
      logPlaybackMetric(metric, "AUDIO_CANPLAY");
    };
    const onPlaying = () => {
      if (playbackMetricRef.current !== metric) return;
      if (!metric.canplayAt) {
        metric.fetchEndAt = readResourceResponseEnd(src, nowPerf());
        metric.canplayAt = nowPerf();
      }
      metric.playingAt = nowPerf();
      startProgressSync(audio);
      logPlaybackMetric(metric, "AUDIO_PLAYING");
    };
    audio.addEventListener("canplay", onCanPlay, { once: true });
    audio.addEventListener("playing", onPlaying, { once: true });
    audio.preload = "auto";
    audio.load();

    try {
      setPlaybackError(null);
      setIsLoadingPlayback(true);

      if (semitoneShift === 0) {
        await audio.play();
        if (session === pitchSessionRef.current) {
          setIsPlaying(true);
          startProgressSync(audio);
        }
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
      if (session === pitchSessionRef.current) {
        setIsPlaying(true);
        startProgressSync(audio);
      }
    } catch (error) {
      console.error("[PlaylistPlayer] playback failed", error);
      stopProgressSync();
      setPlaybackError(friendlyPlaybackError(error));
      setIsPlaying(false);
    } finally {
      setIsLoadingPlayback(false);
    }
  }

  async function togglePlay() {
    const audio = audioRef.current;
    if (isPlaying) {
      try { pitchControllerRef.current?.pause(); } catch {}
      audio?.pause();
      stopProgressSync();
      syncProgressFromAudio(audio);
      setIsPlaying(false);
      return;
    }

    await startPlayback();
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
    resetPlayback(null);
    setSelectedTone(tone);
    setSelectedVoice(voices.includes(selectedVoice as PlaylistTrackVoice) ? selectedVoice : firstVoice(voices));
  }

  function handleVoiceChange(voice: PlaylistTrackVoice) {
    resetPlayback(null);
    setSelectedVoice(voice);
  }

  if (!currentKit) {
    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-6 text-white">Playlist vazia.</main>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8">
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => {
          setIsPlaying(true);
          startProgressSync(audioRef.current);
        }}
        onPause={() => {
          setIsPlaying(false);
          stopProgressSync();
          syncProgressFromAudio(audioRef.current);
        }}
        onEnded={() => {
          stopProgressSync();
          disposePitchController();
          if (currentKitIndex < kits.length - 1 || replayAtEnd) autoPlayNextRef.current = true;
          next();
        }}
        onError={() => {
          stopProgressSync();
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
                      disabled={isStudyModeEnabled}
                      className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                      disabled={isStudyModeEnabled}
                      className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {voiceOptions.map((voice) => <option key={voice} value={voice}>{voiceLabel(voice)}</option>)}
                    </select>
                  </label>
                </div>

                <p className="mt-4 text-sm text-zinc-300">
                  Áudio selecionado: {currentTrack ? `${activeTone} • ${voiceLabel(currentTrack.voice)}` : "Indisponível"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Tom original: {currentKit.original_tone ?? "não informado"} • Tom inicial: {currentKit.default_tone ?? currentKit.original_tone ?? "automático"}
                </p>
                {isStudyModeEnabled ? (
                  <p className="mt-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-100">
                    Modo Estudo ativo: usando {voiceLabel(studySettings.voice)} e o tom definido para esta faixa.
                  </p>
                ) : null}
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
                    if (audioRef.current) {
                      audioRef.current.currentTime = value;
                      syncProgressFromAudio(audioRef.current);
                    }
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
                  <Link
                    href="/minhas-playlists"
                    onClick={() => resetPlayback(null)}
                    className="ml-auto rounded-full border border-white/20 px-4 py-2 text-sm text-zinc-100"
                  >
                    Sair da playlist
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-300/20 bg-gradient-to-br from-gold-500/10 via-zinc-950/80 to-cyan-500/10 p-5 shadow-premium md:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold-200">Modo Estudo</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Estudo sequencial da playlist</h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-300">
                Ao ativar, a playlist tocará todos os kits no nipe e tom definidos para estudo sequencial.
              </p>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-white/15 bg-black/30 px-4 py-3 text-sm font-semibold text-white">
              <input
                type="checkbox"
                checked={studyDraft.enabled}
                onChange={(event) => {
                  setStudyDraft((current) => ({ ...current, enabled: event.target.checked }));
                  setStudySaveMessage(null);
                }}
                className="h-4 w-4 accent-gold-300"
              />
              {studyDraft.enabled ? "Ativado" : "Desativado"}
            </label>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[260px_1fr]">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-400">Nipe global</span>
              <select
                value={studyDraft.voice}
                onChange={(event) => {
                  setStudyDraft((current) => ({ ...current, voice: event.target.value as StudyVoice }));
                  setStudySaveMessage(null);
                }}
                className="h-11 w-full rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white outline-none"
              >
                {STUDY_VOICE_OPTIONS.map((voice) => (
                  <option key={voice} value={voice}>{voiceLabel(voice)}</option>
                ))}
              </select>
            </label>

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-zinc-400">Tom por faixa</p>
              <div className="grid gap-2 md:grid-cols-2">
                {kits.map((kit, index) => {
                  const studyToneOptions = getStudyToneOptions(kit);
                  const draftTone = studyDraft.tonesByItem[kit.id] || getDefaultStudyTone(kit) || studyToneOptions[0] || "";
                  return (
                    <label key={kit.id} className="grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                      <span className="line-clamp-1 text-sm font-semibold text-white">{index + 1}. {kit.name}</span>
                      <span className="line-clamp-1 text-xs text-zinc-400">{kit.artist}</span>
                      <select
                        value={draftTone}
                        onChange={(event) => handleStudyToneChange(kit.id, event.target.value)}
                        className="h-10 rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white outline-none"
                      >
                        {studyToneOptions.map((tone) => <option key={tone} value={tone}>{tone}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveStudyMode}
              className="rounded-full border border-gold-300/50 bg-gold-300/15 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-gold-100 transition hover:bg-gold-300/25"
            >
              Salvar modo estudo
            </button>
            {studySaveMessage ? <span className="text-sm text-cyan-100">{studySaveMessage}</span> : null}
          </div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-black/30 p-4 md:p-5">
          <h3 className="text-lg font-medium text-white">Fila</h3>
          <p className="mt-1 text-xs text-zinc-400">A fila mostra os kits na ordem da playlist. No Modo Estudo, tom e nipe seguem as preferências salvas.</p>
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
