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
import { midiToNoteName } from "@/lib/audio/pitch-analysis";
import type { PublicKit, PublicKitAudioFile, PublicKitToneGroup, VoiceType } from "@/lib/data/public-kits";
import { analyzeTargetVoiceTessitura, type TargetVoiceTessituraAnalysis, type VocalRangeType } from "@/lib/music/tessitura";
import { formatToneLabel, normalizeTone, resolveToneTrack, sortTonesByChromaticOrder } from "@/lib/music/tones";

interface KitPageTemplateProps {
  kit: PublicKit;
  accessContext: any;
}

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
};

type AudioFilesApiTone = {
  tone: string;
  files?: AudioFilesApiFile[];
};

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

function mapApiTonesToPublicToneGroups(tones: AudioFilesApiTone[]): PublicKitToneGroup[] {
  const groups = new Map<string, PublicKitToneGroup>();

  for (const toneGroup of tones ?? []) {
    const tone = normalizeTone(toneGroup.tone);
    if (!tone) continue;

    const group = groups.get(tone) ?? { tone, voices: {} };

    for (const file of toneGroup.files ?? []) {
      const id = String(file.id ?? "").trim();
      if (!id) continue;

      const voice = normalizeVoice(file.voice ?? file.name);
      group.voices[voice] = {
        id,
        tone,
        voice,
        name: file.name ?? voice,
        audioFileId: id,
        streamUrl: file.streamUrl ?? `/api/audio/${id}`,
        fileType: file.fileType ?? file.file_type ?? "mp3",
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

export function KitPageTemplate({ kit, accessContext }: KitPageTemplateProps) {
  const audioEngine = useKitAudioEngine();
  const { stopPlayback } = audioEngine;
  const [liveKit, setLiveKit] = useState<PublicKit>(kit);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAudioFiles() {
      try {
        const response = await fetch(`/api/kits/${kit.id}/audio-files`, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.tones) return;

        const liveTones = mapApiTonesToPublicToneGroups(data.tones as AudioFilesApiTone[]);
        if (cancelled || liveTones.length === 0) return;

        setLiveKit((current) => ({ ...current, tones: liveTones }));
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
      />
    );
  }
  const realToneOptions = useMemo(() => sortTonesByChromaticOrder(liveKit.tones.map((tone) => tone.tone)), [liveKit.tones]);
  const initialTone = normalizeTone(liveKit.defaultTone) ?? normalizeTone(liveKit.originalTone) ?? realToneOptions[0] ?? "";

  const [selectedTone, setSelectedTone] = useState<string>(initialTone);
  const [selectedVoice, setSelectedVoice] = useState<VoiceType>("todos");
  const [loginOpen, setLoginOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeConfig, setUpgradeConfig] = useState({
    title: "Upgrade necessário",
    message: "Faça upgrade para continuar.",
    ctaLabel: "Assinar Premium",
    ctaHref: "/assinar?plan=premium",
  });

  const availableTones = useMemo(
    () => liveKit.tones.filter((tone) => Array.isArray((tone as PublicKitToneGroup & { files?: unknown[] }).files) && ((tone as PublicKitToneGroup & { files?: unknown[] }).files?.length ?? 0) > 0),
    [liveKit.tones],
  );
  const toneOptions = useMemo(() => {
    const originalTone = normalizeTone(liveKit.originalTone) ?? normalizeTone(liveKit.defaultTone) ?? null;
    return availableTones.map((toneGroup) => ({
      tone: toneGroup.tone,
      label: formatToneLabel(toneGroup.tone),
      isOriginal: Boolean(originalTone && toneGroup.tone === originalTone),
      isAvailable: true,
    }));
  }, [availableTones, liveKit.originalTone, liveKit.defaultTone]);
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
      return;
    }

    stopPlayback();
    setSelectedTone(normalizedTone);
  }

  function handleSelectVoice(voice: VoiceType) {
    if (voice !== selectedVoice) stopPlayback();
    setSelectedVoice(voice);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] px-4 py-6 md:px-8 md:py-10">
      <section className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium backdrop-blur md:p-8">
        <div className="grid gap-8 md:grid-cols-[280px_1fr] md:gap-10">
          <img src={liveKit.coverUrl ?? "https://placehold.co/600x600/101114/f4f4f5?text=Harmomus"} alt={liveKit.name} className="aspect-square w-full rounded-xl border border-white/10 object-cover" />
          <div>
            <div className="mb-2 flex justify-end">
              <KitActionsMenu
                kitName={liveKit.name}
                kitSlug={liveKit.slug}
                categorySlug={liveKit.category?.slug}
                planSlug={accessContext.effectiveSlug}
                onPremiumRequired={openPremiumToneUpgrade}
              />
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-white">{liveKit.name}</h1>
            <div className="mt-3"><AccessStatusBadge planSlug={accessContext.effectiveSlug} /></div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">Modular tom</p>
                  <span className="rounded-full border border-emerald-400/20 px-2 py-1 text-[11px] text-emerald-200">Arquivos reais</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {toneOptions.map((option) => {
                    const active = normalizeTone(selectedTone) === normalizeTone(option.tone);
                    return (
                      <button
                        key={option.tone}
                        type="button"
                        disabled={!option.isAvailable}
                        onClick={() => handleSelectTone(option.tone)}
                        className={`rounded-xl border px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? "border-gold-300 bg-gold-400/15 text-gold-100"
                            : "border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
                        }`}
                      >
                        <span className="block font-medium">{option.label}</span>
                        <span className="mt-0.5 block text-[10px] text-zinc-400">
                          {option.isAvailable ? (option.isOriginal ? "Original" : "Disponível") : "Indisponível"}
                        </span>
                      </button>
                    );
                  })}
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
                        message: "Assine o Premium e continue estudando sem interrupções.",
                        ctaLabel: "Liberar acesso com Premium",
                        ctaHref: "/assinar?plan=premium",
                      });
                    } else {
                      const requiredPlan = accessContext.play.requiredPlan ?? "premium";
                      const planLabel = requiredPlan === "plus" ? "Plus" : "Premium";
                      setUpgradeConfig({
                        title: `Este kit requer plano ${planLabel}.`,
                        message: "Faça upgrade para desbloquear este conteúdo agora.",
                        ctaLabel: "Assinar Premium",
                        ctaHref: "/assinar?plan=premium",
                      });
                    }
                    setUpgradeOpen(true);
                  }
                }}
              />

              {selectedVoice === "todos" ? (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-zinc-400">
                  A faixa “Todos” é a referência completa do arranjo. A leitura de tessitura inteligente aparece quando houver arquivos reais gerados para os demais tons.
                </div>
              ) : selectedFile ? (
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-100/80">
                  Arquivo real disponível para {voiceLabel(selectedVoice)} em {formatToneLabel(selectedTone)}. A reprodução não usa modulação em tempo real.
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
