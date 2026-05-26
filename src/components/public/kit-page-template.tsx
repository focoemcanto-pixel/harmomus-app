"use client";

import { useMemo, useState } from "react";
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
import { CHROMATIC_TONES_SHARP, formatToneLabel, normalizeTone, resolveToneTrack, sortTonesByChromaticOrder } from "@/lib/music/tones";

interface KitPageTemplateProps {
  kit: PublicKit;
  accessContext: any;
}

type ToneOption = {
  tone: string;
  label: string;
  isOriginal: boolean;
  isExact: boolean;
  isPitchShifted: boolean;
  semitoneShift: number;
  sourceTone: string | null;
  isAvailable: boolean;
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

function getToneByShift(baseTone: string, shift: number) {
  const normalized = normalizeTone(baseTone);
  if (!normalized) return null;
  const index = CHROMATIC_TONES_SHARP.indexOf(normalized);
  if (index < 0) return null;
  return CHROMATIC_TONES_SHARP[(index + shift + 12) % 12];
}

function buildToneOptions({ kit, selectedVoice }: { kit: PublicKit; selectedVoice: VoiceType }): ToneOption[] {
  const realTones = sortTonesByChromaticOrder(kit.tones.map((tone) => tone.tone));
  const originalTone = normalizeTone(kit.originalTone) ?? normalizeTone(kit.defaultTone) ?? realTones[0] ?? null;
  const maxShift = Math.max(0, Math.min(12, Math.round(kit.maxPitchShiftSemitones ?? 2)));
  const candidates = new Set<string>();

  for (const tone of realTones) candidates.add(tone);

  if (kit.allowPitchShift && originalTone) {
    for (let shift = -maxShift; shift <= maxShift; shift += 1) {
      const tone = getToneByShift(originalTone, shift);
      if (tone) candidates.add(tone);
    }
  }

  const tracks = kit.tones.flatMap((toneGroup) => {
    const preferred = toneGroup.voices[selectedVoice] ?? toneGroup.voices.todos;
    return preferred ? [preferred] : [];
  });

  return sortTonesByChromaticOrder(Array.from(candidates)).map((tone) => {
    const resolution = resolveToneTrack({
      tracks,
      requestedTone: tone,
      allowPitchShift: kit.allowPitchShift,
      maxPitchShiftSemitones: kit.maxPitchShiftSemitones,
      pickTrack: (toneTracks) => toneTracks.find((track) => track.voice === selectedVoice) ?? toneTracks.find((track) => track.voice === "todos") ?? toneTracks[0] ?? null,
    });

    return {
      tone,
      label: formatToneLabel(tone),
      isOriginal: Boolean(originalTone && tone === originalTone),
      isExact: resolution.isExact,
      isPitchShifted: resolution.isPitchShifted,
      semitoneShift: resolution.semitoneShift,
      sourceTone: resolution.sourceTone,
      isAvailable: resolution.isAvailable,
    };
  });
}

function getToneGroup(kit: PublicKit, tone: string): PublicKitToneGroup | null {
  return kit.tones.find((toneGroup) => normalizeTone(toneGroup.tone) === normalizeTone(tone)) ?? null;
}

export function KitPageTemplate({ kit, accessContext }: KitPageTemplateProps) {
  const audioEngine = useKitAudioEngine();
  const { stopPlayback } = audioEngine;

  if (!accessContext?.play?.allowed) {
    return (
      <PremiumKitGateCard
        mode={accessContext?.isGuest ? "guest" : "upgrade"}
      />
    );
  }
  const realToneOptions = useMemo(() => sortTonesByChromaticOrder(kit.tones.map((tone) => tone.tone)), [kit.tones]);
  const initialTone = normalizeTone(kit.defaultTone) ?? normalizeTone(kit.originalTone) ?? realToneOptions[0] ?? "";

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

  const toneOptions = useMemo(() => buildToneOptions({ kit, selectedVoice }), [kit, selectedVoice]);
  const tracksForSelectedVoice = useMemo(
    () => kit.tones.flatMap((toneGroup) => {
      const preferred = toneGroup.voices[selectedVoice] ?? toneGroup.voices.todos;
      return preferred ? [preferred] : [];
    }),
    [kit.tones, selectedVoice],
  );

  const toneResolution = useMemo(() => resolveToneTrack({
    tracks: tracksForSelectedVoice,
    requestedTone: selectedTone,
    allowPitchShift: kit.allowPitchShift,
    maxPitchShiftSemitones: kit.maxPitchShiftSemitones,
    pickTrack: (toneTracks) => toneTracks.find((track) => track.voice === selectedVoice) ?? toneTracks.find((track) => track.voice === "todos") ?? toneTracks[0] ?? null,
  }), [tracksForSelectedVoice, selectedTone, kit.allowPitchShift, kit.maxPitchShiftSemitones, selectedVoice]);

  const sourceTone = toneResolution.sourceTone ?? selectedTone;
  const currentTone = getToneGroup(kit, sourceTone) ?? kit.tones[0];
  const selectedFile = toneResolution.sourceTrack ?? currentTone?.voices[selectedVoice] ?? currentTone?.voices.todos ?? null;
  const semitoneShift = toneResolution.isPitchShifted ? toneResolution.semitoneShift : 0;
  const isModulated = semitoneShift !== 0;
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

    if (normalizeTone(selectedTone) !== normalizedTone) stopPlayback();
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
          <img src={kit.coverUrl ?? "https://placehold.co/600x600/101114/f4f4f5?text=Harmomus"} alt={kit.name} className="aspect-square w-full rounded-xl border border-white/10 object-cover" />
          <div>
            <div className="mb-2 flex justify-end">
              <KitActionsMenu
                kitName={kit.name}
                kitSlug={kit.slug}
                categorySlug={kit.category?.slug}
                planSlug={accessContext.effectiveSlug}
                onPremiumRequired={openPremiumToneUpgrade}
              />
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-white">{kit.name}</h1>
            <div className="mt-3"><AccessStatusBadge planSlug={accessContext.effectiveSlug} /></div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-400">Modular tom</p>
                  {isModulated ? (
                    <span className="rounded-full border border-gold-400/30 px-2 py-1 text-[11px] text-gold-200">
                      Usando {formatToneLabel(sourceTone)} {semitoneShift > 0 ? `+${semitoneShift}` : semitoneShift} semitom(ns)
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-400/20 px-2 py-1 text-[11px] text-emerald-200">Tom base/original</span>
                  )}
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
                          {option.isOriginal ? "Original" : option.isExact ? "Gravado" : option.isPitchShifted ? "Modulado" : "Indisponível"}
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
                canPlay={accessContext.play.allowed && toneResolution.isAvailable}
                semitoneShift={semitoneShift}
                onBlocked={() => {
                  if (accessContext.play.reason === "guest") setLoginOpen(true);
                  else {
                    if (!toneResolution.isAvailable) {
                      setUpgradeConfig({
                        title: "Tom indisponível para este kit.",
                        message: "Este tom ainda não possui áudio gravado e está fora do limite de modulação configurado.",
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
                  A faixa “Todos” é a referência completa do arranjo. A leitura de tessitura inteligente aparece ao modular Soprano, Contralto ou Tenor.
                </div>
              ) : !isModulated ? (
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-100/80">
                  Tom base do arranjo. Esta linha foi gravada como referência oficial para {voiceLabel(selectedVoice)}; os alertas inteligentes aparecem quando você modular o tom.
                </div>
              ) : tessituraAnalysis ? (
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-zinc-200">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 px-2 py-1">Linha: {voiceLabel(selectedVoice)}</span>
                    <span className="rounded-full border border-white/10 px-2 py-1">Zona após modulação: {statusLabel(tessituraAnalysis.status)}</span>
                    {tessituraAnalysis.suggestedOctaveShift !== 0 ? <span className="rounded-full border border-gold-400/30 px-2 py-1 text-gold-200">Leitura: {tessituraAnalysis.suggestedOctaveShift > 0 ? "+1 oitava" : "-1 oitava"}</span> : null}
                  </div>
                  <p className="mt-2 text-zinc-300">{tessituraAnalysis.message}</p>
                  <p className="mt-1 text-zinc-500">
                    Faixa original: {midiRange ? `${midiToNoteName(midiRange.min)} → ${midiToNoteName(midiRange.max)}` : "não analisada"} • Após modulação: {midiToNoteName(tessituraAnalysis.targetMidiRange.min)} → {midiToNoteName(tessituraAnalysis.targetMidiRange.max)}
                  </p>

                  {arrangementGuidance ? (
                    <div className="mt-3 rounded-xl border border-gold-400/20 bg-gold-400/10 p-3">
                      <p className="font-medium text-gold-200">{arrangementGuidance.title}</p>
                      <p className="mt-1 text-gold-100/80">{arrangementGuidance.description}</p>
                    </div>
                  ) : null}
                </div>
              ) : selectedFile ? (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-zinc-400">
                  Tessitura ainda não analisada para esta voz. Analise no painel admin para liberar a leitura inteligente da modulação.
                </div>
              ) : null}

              <AccessCounter value={accessContext.play.stats?.uniqueKitCount24h ?? 0} limit={accessContext.play.stats?.limit ?? 5} />
            </div>
          </div>
        </div>
      </section>
      {kit.lyrics?.trim() ? (
        <section className="mx-auto mt-8 w-full max-w-4xl md:mt-12">
          <h2 className="mb-4 text-center text-2xl font-semibold tracking-wide text-zinc-100 md:mb-6 md:text-3xl">Letra</h2>
          <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-6 shadow-[0_0_60px_rgba(168,85,247,0.12)] backdrop-blur-xl md:rounded-3xl md:p-10">
            <p className="whitespace-pre-wrap text-base leading-8 text-zinc-100 md:text-lg md:leading-9">{kit.lyrics}</p>
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
