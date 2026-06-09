"use client";

import { useEffect, useMemo, useState } from "react";
import { AccessCounter } from "@/components/public/access-counter";
import { AccessStatusBadge } from "@/components/public/access-status-badge";
import { HarmomusPlayer } from "@/components/public/harmomus-player";
import { KitActionsMenu } from "@/components/public/kit-actions-menu";
import { LoginRequiredModal } from "@/components/public/login-required-modal";
import { PremiumKitGateCard } from "@/components/public/premium-kit-gate-card";
import { UpgradeRequiredModal } from "@/components/public/upgrade-required-modal";
import { VoiceSelector } from "@/components/public/voice-selector";
import { useKitAudioEngine } from "@/components/public/use-kit-audio-engine";
import type { PublicKit, PublicKitAudioFile, PublicKitToneGroup, VoiceType } from "@/lib/data/public-kits";
import { analyzeTargetVoiceTessitura, evaluateGroupTessituraForTone, type GroupTessituraVoice, type GroupTessituraRecommendation, type TargetVoiceTessituraAnalysis, type TessituraSourceFile, type VocalRangeType } from "@/lib/music/tessitura";
import { formatToneLabel, normalizeTone, resolveToneTrack, sortTonesByChromaticOrder } from "@/lib/music/tones";

interface KitPageTemplateProps {
  kit: PublicKit;
  accessContext: any;
  favoriteButton?: React.ReactNode;
}

type FreeAccessStats = {
  accessCountToday?: number;
  remaining?: number;
  limit?: number;
  nextResetAt?: string;
};

type AudioSource = "original" | "generated";

type AudioFilesApiFile = {
  id?: string;
  tone?: string;
  name?: string;
  voice?: VoiceType;
  fileType?: string;
  file_type?: string;
  streamUrl?: string;
  url?: string;
  minMidiNote?: number | null;
  maxMidiNote?: number | null;
  detectedMinMidiNote?: number | null;
  detectedMaxMidiNote?: number | null;
  tessituraConfidence?: number | null;
  tessituraSource?: "manual" | "auto" | "hybrid";
  source_type?: AudioSource;
  source?: AudioSource;
  isGenerated?: boolean;
};

type AudioFilesApiTone = {
  tone: string;
  source_type?: AudioSource;
  source?: AudioSource;
  isGenerated?: boolean;
  files?: AudioFilesApiFile[];
};

const CHROMATIC_ORDER = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const VOICE_PRELOAD_ORDER: VoiceType[] = ["todos", "tenor", "contralto", "soprano"];
const MANUAL_TESSITURA_VOICES = ["soprano", "contralto", "tenor"] as const;

function normalizeAudioSource(value: unknown): AudioSource {
  return value === "generated" ? "generated" : "original";
}

function voiceLabel(voice: string) {
  const map: Record<string, string> = {
    todos: "Todos",
    tenor: "Tenor",
    contralto: "Contralto",
    soprano: "Soprano",
    baritono: "Barítono",
  };
  return map[voice] ?? voice;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    comfortable: "Confortável",
    extended: "Estendida",
    extreme: "Extrema",
    unsafe: "Fora da zona segura",
  };
  return map[status] ?? status;
}

function normalizeVoice(value: string | null | undefined): VoiceType {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized.includes("soprano")) return "soprano";
  if (normalized.includes("contralto")) return "contralto";
  if (normalized.includes("tenor")) return "tenor";
  return "todos";
}

function getMidiRange(file: PublicKitAudioFile | null) {
  if (!file) return null;
  const min = file.minMidiNote ?? file.detectedMinMidiNote;
  const max = file.maxMidiNote ?? file.detectedMaxMidiNote;
  if (typeof min !== "number" || typeof max !== "number") return null;
  return { min, max };
}

function buildManualTessituraSourceFiles(kit: PublicKit): TessituraSourceFile[] | null {
  if (!kit.manualTessituraRanges || !kit.originalTone) return null;
  const originalTone = normalizeTone(kit.originalTone);
  if (!originalTone) return null;

  const files: TessituraSourceFile[] = [];

  for (const voice of MANUAL_TESSITURA_VOICES) {
    const range = kit.manualTessituraRanges[voice];
    if (!range) continue;
    files.push({
      tone: originalTone,
      voice,
      minMidi: range.min_midi,
      maxMidi: range.max_midi,
      confidence: 1,
    });
  }

  return files.length ? files : null;
}

function buildAnalysisTessituraSourceFiles(kit: PublicKit): TessituraSourceFile[] {
  return kit.tones.flatMap((toneGroup) => (["soprano", "contralto", "tenor"] as const).flatMap((voice) => {
    const file = toneGroup.voices[voice];
    const range = getMidiRange(file ?? null);
    if (!file || !range) return [];

    return [{
      tone: toneGroup.tone,
      voice,
      minMidi: range.min,
      maxMidi: range.max,
      confidence: file.tessituraConfidence,
    }];
  }));
}

function buildTessituraSourceFiles(kit: PublicKit): TessituraSourceFile[] {
  return buildManualTessituraSourceFiles(kit) ?? buildAnalysisTessituraSourceFiles(kit);
}

function manualGroupStatusClass(status: GroupTessituraRecommendation["status"]) {
  if (status === "original" || status === "keep-original") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
  if (status === "unavailable") return "border-zinc-300/20 bg-white/5 text-zinc-100";
  return "border-amber-300/25 bg-amber-400/10 text-amber-100";
}

function toAnalyzableVoice(voice: VoiceType): VocalRangeType | null {
  if (voice === "tenor" || voice === "contralto" || voice === "soprano") return voice;
  return null;
}

function getArrangementGuidance(analysis: TargetVoiceTessituraAnalysis | null, selectedVoice: VoiceType, isModulated: boolean) {
  if (!analysis || !isModulated) return null;

  const isRisky = analysis.status === "extreme" || analysis.status === "unsafe" || analysis.suggestedOctaveShift !== 0;
  if (!isRisky) return null;

  const octaveText = analysis.suggestedOctaveShift === -12
    ? "1 oitava abaixo"
    : analysis.suggestedOctaveShift === 12
      ? "1 oitava acima"
      : "na oitava atual";

  return {
    title: "Atenção à modulação do arranjo",
    description:
      analysis.suggestedOctaveShift !== 0
        ? `Ao modular, a linha de ${voiceLabel(selectedVoice)} saiu da zona ideal. Para manter a função vocal, considere estudar essa linha ${octaveText}.`
        : `Ao modular, a linha de ${voiceLabel(selectedVoice)} entrou em região ${statusLabel(analysis.status).toLowerCase()}. Avalie redistribuir as linhas entre os nipes para preservar conforto e timbre.`,
  };
}

function getToneGroup(kit: PublicKit, tone: string): PublicKitToneGroup | null {
  return kit.tones.find((toneGroup) => normalizeTone(toneGroup.tone) === normalizeTone(tone)) ?? null;
}

function getClosestToneStep(currentTone: string, availableTones: string[], direction: -1 | 1) {
  const current = normalizeTone(currentTone);
  if (!current) return null;

  const availableSet = new Set(availableTones.map((tone) => normalizeTone(tone)).filter(Boolean));
  const currentIndex = CHROMATIC_ORDER.indexOf(current as (typeof CHROMATIC_ORDER)[number]);
  if (currentIndex < 0 || availableSet.size === 0) return null;

  for (let step = 1; step <= CHROMATIC_ORDER.length; step += 1) {
    const nextIndex = (currentIndex + direction * step + CHROMATIC_ORDER.length) % CHROMATIC_ORDER.length;
    const candidate = CHROMATIC_ORDER[nextIndex];
    if (candidate !== current && availableSet.has(candidate)) return candidate;
  }

  return null;
}

function buildTrackId(src: string, title: string, voice: VoiceType, tone: string) {
  return [src, title, voiceLabel(voice).toLowerCase(), formatToneLabel(tone), "0"].join("::");
}

function mapApiTonesToPublicToneGroups(tones: AudioFilesApiTone[]) {
  const groups = new Map<string, PublicKitToneGroup>();

  for (const toneGroup of tones ?? []) {
    const tone = normalizeTone(toneGroup.tone);
    if (!tone) continue;

    const group = groups.get(tone) ?? { tone, voices: {} };

    for (const file of toneGroup.files ?? []) {
      const id = String(file.id ?? "").trim();
      if (!id) continue;

      const voice = normalizeVoice(file.voice ?? file.name);
      const source = normalizeAudioSource(file.source_type);
      group.voices[voice] = {
        id,
        tone,
        voice,
        name: file.name ?? voice,
        audioFileId: id,
        streamUrl: file.streamUrl ?? `/api/audio/${id}`,
        fileType: file.fileType ?? file.file_type ?? "mp3",
        source_type: source,
        source,
        isGenerated: source === "generated",
        minMidiNote: file.minMidiNote ?? null,
        maxMidiNote: file.maxMidiNote ?? null,
        detectedMinMidiNote: file.detectedMinMidiNote ?? null,
        detectedMaxMidiNote: file.detectedMaxMidiNote ?? null,
        tessituraConfidence: file.tessituraConfidence ?? null,
        tessituraSource: file.tessituraSource ?? "manual",
      };
    }

    groups.set(tone, group);
  }

  return sortTonesByChromaticOrder(Array.from(groups.keys())).map((tone) => groups.get(tone)!).filter(Boolean);
}

export function KitPageTemplate({ kit, accessContext, favoriteButton }: KitPageTemplateProps) {
  const audioEngine = useKitAudioEngine();
  const { stopPlayback, preloadTrack } = audioEngine;
  const canPlay = Boolean(accessContext?.play?.allowed);
  const [liveKit, setLiveKit] = useState<PublicKit>(kit);
  const [freeAccessStats, setFreeAccessStats] = useState<FreeAccessStats | null>(accessContext?.play?.stats ?? null);

  useEffect(() => {
    setLiveKit(kit);
    setFreeAccessStats(accessContext?.play?.stats ?? null);
  }, [accessContext?.play?.stats, kit]);

  useEffect(() => {
    if (accessContext?.effectiveSlug !== "free" || !accessContext?.play?.allowed || !accessContext?.profile?.id) return;

    let cancelled = false;

    async function registerVisit() {
      try {
        const response = await fetch(`/api/kits/${kit.id}/access`, { method: "POST", cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!cancelled && response.ok && data?.stats) setFreeAccessStats(data.stats);
      } catch (error) {
        console.warn("[KitPageTemplate] Could not register free kit access", error);
      }
    }

    void registerVisit();

    return () => {
      cancelled = true;
    };
  }, [accessContext?.effectiveSlug, accessContext?.play?.allowed, accessContext?.profile?.id, kit.id]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAudioFiles() {
      try {
        const response = await fetch(`/api/kits/${kit.id}/audio-files`, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.tones) return;

        const toneGroups = mapApiTonesToPublicToneGroups(data.tones as AudioFilesApiTone[]);
        if (cancelled || toneGroups.length === 0) return;

        setLiveKit((current) => ({ ...current, tones: toneGroups }));
      } catch (error) {
        console.warn("[KitPageTemplate] Could not hydrate live audio files", error);
      }
    }

    void hydrateAudioFiles();

    return () => {
      cancelled = true;
    };
  }, [kit.id]);

  const realToneOptions = useMemo(() => sortTonesByChromaticOrder(liveKit.tones.map((tone) => tone.tone)), [liveKit.tones]);
  const initialTone = normalizeTone(liveKit.defaultTone) ?? normalizeTone(liveKit.originalTone) ?? realToneOptions[0] ?? "";

  const [selectedTone, setSelectedTone] = useState<string>(initialTone);
  const [selectedVoice, setSelectedVoice] = useState<VoiceType>("todos");
  const [loginOpen, setLoginOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [toneMenuOpen, setToneMenuOpen] = useState(false);
  const [upgradeConfig, setUpgradeConfig] = useState({
    title: "Upgrade necessário",
    message: "Faça upgrade para continuar.",
    ctaLabel: "Assinar Premium",
    ctaHref: "/assinar?plano=premium",
  });

  const availableTones = useMemo(
    () => liveKit.tones.filter((tone) => Object.values(tone.voices ?? {}).some((file) => Boolean(file?.streamUrl))),
    [liveKit.tones],
  );
  const toneOptions = useMemo(() => {
    return availableTones.map((toneGroup) => {
      const selectedToneFile = toneGroup.voices[selectedVoice]
        ?? toneGroup.voices.todos
        ?? (Object.values(toneGroup.voices ?? {}).filter(Boolean)[0] as PublicKitAudioFile | undefined);
      const sourceType = normalizeAudioSource(selectedToneFile?.source_type);

      return {
        tone: toneGroup.tone,
        label: formatToneLabel(toneGroup.tone),
        sourceType,
        isAvailable: true,
        sourceLabel: sourceType === "generated" ? "Harmomus IA" : "Original",
      };
    });
  }, [availableTones, selectedVoice]);
  const selectedToneOption = toneOptions.find((option) => normalizeTone(option.tone) === normalizeTone(selectedTone)) ?? toneOptions[0] ?? null;
  const tracksForSelectedVoice = useMemo(
    () => liveKit.tones.flatMap((toneGroup) => {
      const preferred = toneGroup.voices[selectedVoice] ?? toneGroup.voices.todos;
      return preferred ? [preferred] : [];
    }),
    [liveKit.tones, selectedVoice],
  );

  const toneResolution = useMemo(() => resolveToneTrack({
    tracks: tracksForSelectedVoice,
    requestedTone: selectedTone,
    allowPitchShift: false,
    maxPitchShiftSemitones: 0,
    pickTrack: (toneTracks) => toneTracks.find((track) => track.voice === selectedVoice) ?? toneTracks.find((track) => track.voice === "todos") ?? toneTracks[0] ?? null,
  }), [tracksForSelectedVoice, selectedTone, selectedVoice]);

  const sourceTone = toneResolution.sourceTone ?? selectedTone;
  const currentTone = getToneGroup(liveKit, sourceTone) ?? null;
  const selectedFile = currentTone?.voices[selectedVoice] ?? currentTone?.voices.todos ?? toneResolution.sourceTrack ?? null;
  const canPlaySelected = canPlay && Boolean(selectedFile?.streamUrl) && Boolean(getToneGroup(liveKit, selectedTone));
  const semitoneShift = 0;
  const isModulated = false;
  const selectedSourceType = normalizeAudioSource(selectedFile?.source_type);
  const selectedIsOriginal = selectedSourceType === "original";
  const midiRange = getMidiRange(selectedFile);
  const analysisVoice = toAnalyzableVoice(selectedVoice);

  const tessituraAnalysis = useMemo(() => {
    if (!isModulated || !selectedFile || !midiRange || !analysisVoice || !toneResolution.sourceTone) return null;
    return analyzeTargetVoiceTessitura({
      requestedTone: selectedTone,
      sourceTone: toneResolution.sourceTone,
      sourceMinMidi: midiRange.min,
      sourceMaxMidi: midiRange.max,
      voice: analysisVoice,
    });
  }, [isModulated, selectedFile, midiRange, selectedTone, analysisVoice, toneResolution.sourceTone]);

  const arrangementGuidance = getArrangementGuidance(tessituraAnalysis, selectedVoice, isModulated);

  const tessituraSourceFiles = useMemo(() => buildTessituraSourceFiles(liveKit), [liveKit]);
  const selectedGroupVoice = toAnalyzableVoice(selectedVoice) as GroupTessituraVoice | null;
  const currentVoiceTessitura = useMemo(
    () =>
      selectedGroupVoice
        ? evaluateGroupTessituraForTone(tessituraSourceFiles, selectedTone, liveKit.originalTone)
        : null,
    [
      selectedGroupVoice,
      selectedTone,
      tessituraSourceFiles,
      liveKit.originalTone,
    ],
  );

  useEffect(() => {
    if (!canPlay || !selectedTone) return;

    const warmed = new Set<string>();
    const selected = normalizeTone(selectedTone) ?? selectedTone;

    function warmFile(file: PublicKitAudioFile | null | undefined, tone: string, voice: VoiceType) {
      if (!file?.streamUrl || warmed.has(file.streamUrl)) return;
      warmed.add(file.streamUrl);
      const title = `Tom ${formatToneLabel(tone)} • Voz ${voiceLabel(voice)}`;
      preloadTrack({
        src: file.streamUrl,
        title,
        semitoneShift: 0,
        trackId: buildTrackId(file.streamUrl, title, voice, tone),
      });
    }

    const selectedGroup = getToneGroup(liveKit, selected);
    if (selectedGroup) {
      const voices = Array.from(new Set([selectedVoice, ...VOICE_PRELOAD_ORDER]));
      for (const voice of voices) warmFile(selectedGroup.voices[voice] ?? selectedGroup.voices.todos, selected, voice);
    }

    for (const direction of [-1, 1] as const) {
      const neighborTone = getClosestToneStep(selected, toneOptions.map((option) => option.tone), direction);
      if (!neighborTone) continue;
      const neighborGroup = getToneGroup(liveKit, neighborTone);
      warmFile(neighborGroup?.voices[selectedVoice] ?? neighborGroup?.voices.todos, neighborTone, selectedVoice);
    }
  }, [canPlay, liveKit, preloadTrack, selectedTone, selectedVoice, toneOptions]);

  function openPremiumToneUpgrade() {
    setUpgradeConfig({
      title: "Solicitação de novos tons é exclusiva do Premium.",
      message: "Assine o Premium para solicitar tons personalizados para qualquer kit do Harmomus.",
      ctaLabel: "Fazer upgrade para Premium",
      ctaHref: "/assinar?plano=premium",
    });
    setUpgradeOpen(true);
  }

  function handleSelectTone(tone: string) {
    const normalizedTone = normalizeTone(tone) ?? tone;
    const firstRealTone = realToneOptions[0] ?? "";

    if (!accessContext.tone.allowed && normalizedTone !== firstRealTone) {
      setUpgradeConfig({
        title: "Troca de tom é um recurso Premium.",
        message: "Experimente todos os tons, todas as vozes e acesso completo aos kits.",
        ctaLabel: "Experimentar Premium grátis por 7 dias",
        ctaHref: "/assinar?plano=premium",
      });
      setUpgradeOpen(true);
      setToneMenuOpen(false);
      return;
    }

    stopPlayback();
    setSelectedTone(normalizedTone);
    setToneMenuOpen(false);
  }


  function handleToneStep(direction: -1 | 1) {
    const nextTone = getClosestToneStep(selectedTone, toneOptions.map((option) => option.tone), direction);
    if (!nextTone) return;
    handleSelectTone(nextTone);
  }

  function handleSelectVoice(voice: VoiceType) {
    stopPlayback();
    setSelectedVoice(voice);
  }

  useEffect(() => {
    if (!selectedTone || toneOptions.some((tone) => normalizeTone(tone.tone) === normalizeTone(selectedTone))) return;
    const fallback = toneOptions[0]?.tone;
    if (fallback) setSelectedTone(fallback);
  }, [selectedTone, toneOptions]);

  if (!canPlay) {
    return (
      <PremiumKitGateCard
        mode={accessContext?.isGuest ? "guest" : "upgrade"}
        reason={accessContext?.play?.reason}
        requiredPlan={accessContext?.play?.requiredPlan}
        stats={accessContext?.play?.stats}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] px-4 py-6 md:px-8 md:py-10">
      <section className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium backdrop-blur md:p-8">
        <div className="grid gap-8 md:grid-cols-[280px_1fr] md:gap-10">
          <img src={liveKit.coverUrl ?? "https://placehold.co/600x600/101114/f4f4f5?text=Harmomus"} alt={liveKit.name} className="aspect-square w-full rounded-xl border border-white/10 object-cover" />
          <div>
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              <KitActionsMenu
                kitName={liveKit.name}
                kitSlug={liveKit.slug}
                categorySlug={liveKit.category?.slug}
                planSlug={accessContext.effectiveSlug}
                canRequestSongsAndTones={accessContext.canRequestSongsAndTones}
                onPremiumRequired={openPremiumToneUpgrade}
              />
              {favoriteButton}
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-white">{liveKit.name}</h1>
            <div className="mt-3"><AccessStatusBadge planSlug={accessContext.effectiveSlug} /></div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">Modular tom</p>
                  <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[11px] font-semibold text-violet-100">Harmomus IA + arquivos reais</span>
                </div>

                <div className="relative">
                  <div className="grid grid-cols-[48px_1fr_48px] items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => handleToneStep(-1)}
                      className="rounded-2xl border border-white/15 bg-white/5 text-xl font-bold text-zinc-100 transition hover:bg-white/10"
                      aria-label="Tom anterior"
                    >
                      ‹
                    </button>

                    <button
                      type="button"
                      onClick={() => setToneMenuOpen((value) => !value)}
                      className="min-h-[64px] rounded-2xl border border-gold-300 bg-gold-400/15 px-4 text-center text-gold-100 shadow-[0_0_24px_rgba(250,204,21,0.08)] transition hover:bg-gold-400/20"
                    >
                      <span className="block text-xs uppercase tracking-[0.16em] text-gold-200/80">Tom atual</span>
                      <span className="block text-2xl font-bold">{selectedToneOption?.label ?? formatToneLabel(selectedTone)}</span>
                      <span className="block text-[11px] text-gold-100/70">{selectedToneOption?.sourceLabel ?? "Selecione"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToneStep(1)}
                      className="rounded-2xl border border-white/15 bg-white/5 text-xl font-bold text-zinc-100 transition hover:bg-white/10"
                      aria-label="Próximo tom"
                    >
                      ›
                    </button>
                  </div>

                  {toneMenuOpen ? (
                    <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-zinc-950 p-2 shadow-2xl">
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {toneOptions.map((option) => (
                          <button
                            key={option.tone}
                            type="button"
                            onClick={() => handleSelectTone(option.tone)}
                            className={`rounded-xl border px-3 py-2 text-left transition ${normalizeTone(option.tone) === normalizeTone(selectedTone) ? "border-gold-300 bg-gold-400/15 text-gold-100" : "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"}`}
                          >
                            <span className="block text-sm font-semibold">{option.label}</span>
                            <span className="block text-[10px] text-zinc-400">{option.sourceLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                  Tons gerados pela Harmomus IA preservam o arranjo original. A tessitura usa a referência manual do tom original quando preenchida.
                </p>
              </div>
              <VoiceSelector selected={selectedVoice} onChange={handleSelectVoice} />
              {currentVoiceTessitura && selectedGroupVoice ? (
                <div className={`rounded-xl border p-3 text-sm ${manualGroupStatusClass(currentVoiceTessitura.status)}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">Tessitura oficial • {voiceLabel(selectedGroupVoice)}</p>
                    <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      {currentVoiceTessitura.statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed opacity-90">{currentVoiceTessitura.message}</p>
                  <p className="mt-2 text-xs font-semibold opacity-95">{currentVoiceTessitura.recommendations[selectedGroupVoice]}</p>
                </div>
              ) : null}
              {arrangementGuidance ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p className="font-semibold">{arrangementGuidance.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/80">{arrangementGuidance.description}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-8">
          <HarmomusPlayer
            engine={audioEngine}
            title={`${liveKit.name} • ${voiceLabel(selectedVoice)} • Tom ${formatToneLabel(selectedTone)}`}
            src={selectedFile?.streamUrl ?? ""}
            canPlay={canPlaySelected}
            semitoneShift={semitoneShift}
            trackId={selectedFile ? buildTrackId(selectedFile.streamUrl, liveKit.name, selectedVoice, selectedTone) : ""}
            sourceTone={sourceTone}
            targetTone={selectedTone}
            isOriginal={selectedIsOriginal}
          />
        </div>
        <AccessCounter stats={freeAccessStats} />
      </section>
      <LoginRequiredModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <UpgradeRequiredModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} {...upgradeConfig} />
    </main>
  );
}
