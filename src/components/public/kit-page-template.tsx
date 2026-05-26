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

function getToneFileCount(toneGroup: PublicKitToneGroup) {
  const files = (toneGroup as PublicKitToneGroup & { files?: unknown[] }).files;
  if (Array.isArray(files)) return files.length;
  return Object.values(toneGroup.voices ?? {}).filter(Boolean).length;
}

function buildToneOptions({ kit }: { kit: PublicKit }): ToneOption[] {
  const availableTones = sortTonesByChromaticOrder(kit.tones.map((tone) => tone.tone));
  const originalTone = normalizeTone(kit.originalTone) ?? normalizeTone(kit.defaultTone) ?? availableTones[0] ?? null;

  return availableTones.map((tone) => {
    const toneGroup = getToneGroup(kit, tone);
    const isAvailable = Boolean(toneGroup && getToneFileCount(toneGroup) > 0);

    return {
      tone,
      label: formatToneLabel(tone),
      isOriginal: Boolean(originalTone && tone === originalTone),
      isAvailable,
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

  const toneOptions = useMemo(() => buildToneOptions({ kit }), [kit]);
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
    allowPitchShift: false,
    maxPitchShiftSemitones: 0,
    pickTrack: (toneTracks) => toneTracks.find((track) => track.voice === selectedVoice) ?? toneTracks.find((track) => track.voice === "todos") ?? toneTracks[0] ?? null,
  }), [tracksForSelectedVoice, selectedTone, selectedVoice]);

  const sourceTone = toneResolution.sourceTone ?? selectedTone;
  const currentTone = getToneGroup(kit, sourceTone) ?? null;
  const selectedFile = currentTone?.voices[selectedVoice] ?? currentTone?.voices.todos ?? toneResolution.sourceTrack ?? null;
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
                canPlay={accessContext.play.allowed && toneResolution.isAvailable && Boolean(selectedFile)}
                semitoneShift={0}
                onBlocked={() => {
                  if (accessContext.play.reason === "guest") setLoginOpen(true);
                  else {
                    if (!toneResolution.isAvailable || !selectedFile) {
                      setUpgradeConfig({
                        title: "Tom ainda não gerado para este nipe.",
                        message: "Este tom precisa existir como arquivo real no Harmomus. Gere ou envie esse tom no painel admin para liberar a reprodução.",
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
