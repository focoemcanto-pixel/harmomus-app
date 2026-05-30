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
import { analyzeTargetVoiceTessitura, evaluateIndividualVoiceTessituraForTone, type GroupTessituraVoice, type IndividualVoiceTessituraRecommendation, type TargetVoiceTessituraAnalysis, type TessituraSourceFile, type VocalRangeType } from "@/lib/music/tessitura";
import { formatToneLabel, normalizeTone, resolveToneTrack, sortTonesByChromaticOrder } from "@/lib/music/tones";

interface KitPageTemplateProps {
  kit: PublicKit;
  accessContext: any;
  favoriteButton?: React.ReactNode;
}

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

function buildTessituraSourceFiles(kit: PublicKit): TessituraSourceFile[] {
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


function harmomusIaStatusClass(status: IndividualVoiceTessituraRecommendation["status"]) {
  if (status === "comfortable") return "border-emerald-400/25 bg-emerald-500/10 text-emerald-100";
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
  const [liveKit, setLiveKit] = useState<PublicKit>(kit);

  useEffect(() => {
    setLiveKit(kit);
  }, [kit]);

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

  if (!accessContext?.play?.allowed) {
    return (
      <PremiumKitGateCard
        mode={accessContext?.isGuest ? "guest" : "upgrade"}
        reason={accessContext?.play?.reason}
        requiredPlan={accessContext?.play?.requiredPlan}
        stats={accessContext?.play?.stats}
      />
    );
  }
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
    ctaHref: "/assinar?plan=premium",
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
  const canPlaySelected = accessContext.play.allowed && Boolean(selectedFile?.streamUrl) && Boolean(getToneGroup(liveKit, selectedTone));
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
    () => selectedGroupVoice ? evaluateIndividualVoiceTessituraForTone(tessituraSourceFiles, selectedTone, selectedGroupVoice) : null,
    [selectedGroupVoice, selectedTone, tessituraSourceFiles],
  );

  useEffect(() => {
    if (!accessContext.play.allowed || !selectedTone) return;

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
  }, [accessContext.play.allowed, liveKit, preloadTrack, selectedTone, selectedVoice, toneOptions]);

  function openPremiumToneUpgrade() {
    setUpgradeConfig({
      title: "Solicitação de novos tons é exclusiva do Premium.",
      message: "Assine o Premium para solicitar tons personalizados para qualquer kit do Harmomus.",
      ctaLabel: "Fazer upgrade para Premium",
      ctaHref: "/assinar?plan=premium",
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
        ctaHref: "/assinar?plan=premium",
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
                      <span className="block text-xl font-bold md:text-2xl">{selectedToneOption?.label ?? formatToneLabel(selectedTone)}</span>
                      <span className={`mt-1 inline-flex rounded-full border px-3 py-0.5 text-[11px] font-bold ${
                        selectedToneOption?.sourceType === "original"
                          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                          : "border-violet-300/30 bg-violet-500/15 text-violet-100"
                      }`}>
                        {selectedToneOption?.sourceLabel ?? "Selecionar tom"}
                      </span>
                      <span className="ml-2 align-middle text-xs text-gold-100/70">▼</span>
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
                    <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-2xl border border-white/15 bg-[#090d18] shadow-[0_24px_70px_rgba(0,0,0,0.55)]">
                      <div className="max-h-72 overflow-y-auto p-2">
                        {toneOptions.map((option) => {
                          const active = normalizeTone(selectedTone) === normalizeTone(option.tone);
                          return (
                            <button
                              key={option.tone}
                              type="button"
                              onClick={() => handleSelectTone(option.tone)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition ${
                                active ? "bg-gold-400/15 text-gold-100" : "text-zinc-100 hover:bg-white/8"
                              }`}
                            >
                              <span className="text-base font-semibold">{option.label}</span>
                              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                option.sourceType === "original"
                                  ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                                  : "border-violet-300/30 bg-violet-500/15 text-violet-100"
                              }`}>
                                {option.sourceLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <VoiceSelector selectedVoice={selectedVoice} onSelectVoice={handleSelectVoice} />
              <HarmomusPlayer
                engine={audioEngine}
                src={selectedFile?.streamUrl ?? null}
                title={`Tom ${formatToneLabel(selectedTone)} • Voz ${voiceLabel(selectedVoice)}`}
                canPlay={canPlaySelected}
                semitoneShift={0}
                onBlocked={() => {
                  if (accessContext.play.reason === "guest") setLoginOpen(true);
                  else {
                    if (!canPlaySelected || !selectedFile) {
                      setUpgradeConfig({
                        title: "Tom ainda não gerado para este nipe.",
                        message: "Este tom precisa existir como arquivo real no Harmomus. Gere ou envie esse tom no painel admin para liberar a reprodução correta.",
                        ctaLabel: "Entendi",
                        ctaHref: "#",
                      });
                    } else if (accessContext.play.reason === "free_limit") {
                      setUpgradeConfig({
                        title: "Você atingiu seu limite gratuito de hoje.",
                        message: "Seu plano Free permite acessar até 3 kits diferentes a cada 24 horas. Faça upgrade para continuar estudando sem interrupções.",
                        ctaLabel: "Fazer upgrade",
                        ctaHref: "/assinar?plan=plus",
                      });
                    } else {
                      const requiredPlan = accessContext.play.requiredPlan ?? "premium";
                      setUpgradeConfig({
                        title: requiredPlan === "plus" ? "Kit exclusivo para Plus e Premium." : "Kit exclusivo para Premium.",
                        message: requiredPlan === "plus" ? "Faça upgrade para desbloquear este kit e toda a biblioteca Plus." : "Faça upgrade para acessar este kit, modulação inteligente e recursos avançados.",
                        ctaLabel: requiredPlan === "plus" ? "Conhecer plano Plus" : "Assinar Premium",
                        ctaHref: requiredPlan === "plus" ? "/assinar?plan=plus" : "/assinar?plan=premium",
                      });
                    }
                    setUpgradeOpen(true);
                  }
                }}
              />

              {currentVoiceTessitura ? (
                <section className={`space-y-2 rounded-2xl border p-4 text-sm shadow-[0_18px_45px_rgba(0,0,0,0.22)] ${harmomusIaStatusClass(currentVoiceTessitura.status)}`}>
                  <p><span className="font-semibold text-white">Status:</span> {currentVoiceTessitura.statusLabel}</p>
                  <p><span className="font-semibold text-white">Motivo:</span> {currentVoiceTessitura.reason}</p>
                  <p><span className="font-semibold text-white">Recomendação:</span> {currentVoiceTessitura.recommendation}</p>
                </section>
              ) : null}

              {selectedVoice === "todos" ? (
                <div className={`rounded-xl border px-4 py-3 text-xs ${
                  selectedIsOriginal
                    ? "border-white/10 bg-black/20 text-zinc-400"
                    : "border-violet-400/20 bg-violet-500/10 text-violet-100/90"
                }`}>
                  {selectedIsOriginal
                    ? "A faixa “Todos” é a referência completa do arranjo. A leitura de tessitura inteligente aparece quando houver arquivos reais gerados para os demais tons."
                    : "Harmomus IA: este tom foi gerado automaticamente a partir do arranjo original para estudo vocal. A reprodução usa arquivo real processado, não modulação em tempo real."}
                </div>
              ) : selectedFile ? (
                <div className={`rounded-xl border px-4 py-3 text-xs ${
                  selectedIsOriginal
                    ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-100/80"
                    : "border-violet-400/20 bg-violet-500/10 text-violet-100/90"
                }`}>
                  {selectedIsOriginal
                    ? `Arquivo real original disponível para ${voiceLabel(selectedVoice)} em ${formatToneLabel(selectedTone)}.`
                    : `Harmomus IA: ${voiceLabel(selectedVoice)} em ${formatToneLabel(selectedTone)} foi modulado inteligentemente a partir do tom original e salvo como arquivo real para estudo.`}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100/90">
                  Este tom ainda não possui arquivo real para {voiceLabel(selectedVoice)}. Gere o tom no admin para liberar a reprodução correta.
                </div>
              )}

              {accessContext.effectiveSlug === "free" ? (
                <AccessCounter value={accessContext.play.stats?.uniqueKitCount24h ?? 0} limit={accessContext.play.stats?.limit ?? 3} />
              ) : null}
            </div>
          </div>
        </div>
      </section>
      {liveKit.lyrics?.trim() ? (
        <section className="mx-auto mt-8 w-full max-w-4xl md:mt-12">
          <h2 className="mb-4 text-center text-2xl font-semibold tracking-wide text-zinc-100 md:mb-6 md:text-3xl">Letra</h2>
          <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6 shadow-[0_0_60px_rgba(168,85,247,0.12)] backdrop-blur-xl md:rounded-3xl md:p-10">
            <p className="whitespace-pre-wrap text-base leading-8 text-zinc-100 md:text-lg md:leading-9">{liveKit.lyrics}</p>
          </div>
        </section>
      ) : null}
      <LoginRequiredModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <UpgradeRequiredModal
        open={upgradeOpen}
        title={upgradeConfig.title}
        message={upgradeConfig.message}
        ctaLabel={upgradeConfig.ctaLabel}
        ctaHref={upgradeConfig.ctaHref}
        onClose={() => setUpgradeOpen(false)}
      />
    </main>
  );
}
