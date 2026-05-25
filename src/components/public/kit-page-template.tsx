"use client";

import { useMemo, useState } from "react";
import { AccessCounter } from "@/components/public/access-counter";
import { AccessStatusBadge } from "@/components/public/access-status-badge";
import { HarmomusPlayer } from "@/components/public/harmomus-player";
import { KitActionsMenu } from "@/components/public/kit-actions-menu";
import { LoginRequiredModal } from "@/components/public/login-required-modal";
import { ToneSelector } from "@/components/public/tone-selector";
import { UpgradeRequiredModal } from "@/components/public/upgrade-required-modal";
import { VoiceSelector } from "@/components/public/voice-selector";
import { midiToNoteName } from "@/lib/audio/pitch-analysis";
import type { PublicKit, PublicKitAudioFile, VoiceType } from "@/lib/data/public-kits";
import { analyzeTessitura } from "@/lib/music/tessitura";

interface KitPageTemplateProps {
  kit: PublicKit;
  accessContext: any;
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

function getMidiRange(file: PublicKitAudioFile | null) {
  if (!file) return null;
  const min = file.minMidiNote ?? file.detectedMinMidiNote;
  const max = file.maxMidiNote ?? file.detectedMaxMidiNote;
  if (typeof min !== "number" || typeof max !== "number") return null;
  return { min, max };
}

function toAvailableVoice(value: string, currentTone: PublicKit["tones"][number] | undefined): VoiceType | null {
  if (value !== "todos" && value !== "tenor" && value !== "contralto" && value !== "soprano") return null;
  return currentTone?.voices[value] ? value : null;
}

function getReinterpretationCopy(analysis: ReturnType<typeof analyzeTessitura>, hasSuggestedVoice: boolean) {
  if (!analysis) return null;
  const isRisky = analysis.status === "extreme" || analysis.status === "unsafe" || analysis.suggestedOctaveShift !== 0;
  if (!isRisky) return null;

  const octaveText = analysis.suggestedOctaveShift === -12
    ? "1 oitava abaixo"
    : analysis.suggestedOctaveShift === 12
      ? "1 oitava acima"
      : "na oitava atual";

  return {
    title: "Reinterpretação vocal sugerida",
    description: `Para preservar conforto e estabilidade, esta voz pode funcionar melhor como ${voiceLabel(analysis.suggestedRange)} cantando ${octaveText}.`,
    button: hasSuggestedVoice ? `Aplicar voz: ${voiceLabel(analysis.suggestedRange)}` : `Aplicar orientação`,
  };
}

export function KitPageTemplate({ kit, accessContext }: KitPageTemplateProps) {
  const [selectedTone, setSelectedTone] = useState(kit.tones[0]?.tone ?? "");
  const [selectedVoice, setSelectedVoice] = useState<VoiceType>("todos");
  const [manualInterpretation, setManualInterpretation] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeConfig, setUpgradeConfig] = useState({
    title: "Upgrade necessário",
    message: "Faça upgrade para continuar.",
    ctaLabel: "Assinar Premium",
    ctaHref: "/assinar?plan=premium",
  });

  const currentTone = kit.tones.find((t) => t.tone === selectedTone) ?? kit.tones[0];
  const selectedFile = currentTone?.voices[selectedVoice] ?? currentTone?.voices.todos ?? null;
  const midiRange = getMidiRange(selectedFile);

  const tessituraAnalysis = useMemo(() => {
    if (!selectedFile || !midiRange) return null;
    return analyzeTessitura({
      requestedTone: selectedTone,
      sourceTone: selectedFile.tone,
      sourceMinMidi: midiRange.min,
      sourceMaxMidi: midiRange.max,
    });
  }, [selectedFile, midiRange, selectedTone]);

  const suggestedVoice = tessituraAnalysis ? toAvailableVoice(tessituraAnalysis.suggestedRange, currentTone) : null;
  const reinterpretation = getReinterpretationCopy(tessituraAnalysis, Boolean(suggestedVoice));

  function applyReinterpretation() {
    if (!tessituraAnalysis) return;

    if (suggestedVoice) {
      setSelectedVoice(suggestedVoice);
    }

    setManualInterpretation(
      `Sugestão aplicada: estudar esta voz como ${voiceLabel(tessituraAnalysis.suggestedRange)}${tessituraAnalysis.suggestedOctaveShift === -12 ? " 1 oitava abaixo" : tessituraAnalysis.suggestedOctaveShift === 12 ? " 1 oitava acima" : ""}.`,
    );
  }

  function openPremiumToneUpgrade() {
    setUpgradeConfig({
      title: "Solicitação de novos tons é exclusiva do Premium.",
      message: "Assine o Premium para solicitar tons personalizados para qualquer kit do Harmomus.",
      ctaLabel: "Fazer upgrade para Premium",
      ctaHref: "/assinar?plan=premium",
    });
    setUpgradeOpen(true);
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
              <ToneSelector tones={kit.tones.map((tone) => tone.tone)} selectedTone={selectedTone} onSelectTone={(tone) => {
                if (!accessContext.tone.allowed && tone !== kit.tones[0]?.tone) {
                  setUpgradeConfig({
                    title: "Troca de tom é um recurso Premium.",
                    message: "Experimente todos os tons, todas as vozes e acesso completo aos kits.",
                    ctaLabel: "Experimentar Premium grátis por 7 dias",
                    ctaHref: "/assinar?plan=premium",
                  });
                  setUpgradeOpen(true);
                  return;
                }
                setSelectedTone(tone);
                setManualInterpretation(null);
              }} />
              <VoiceSelector selectedVoice={selectedVoice} onSelectVoice={(voice) => {
                setSelectedVoice(voice);
                setManualInterpretation(null);
              }} />
              <HarmomusPlayer src={selectedFile?.streamUrl ?? null} title={`Tom ${selectedTone} • Voz ${selectedVoice}`} canPlay={accessContext.play.allowed} onBlocked={() => {
                if (accessContext.play.reason === "guest") setLoginOpen(true);
                else {
                  if (accessContext.play.reason === "free_limit") {
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
              }} />

              {tessituraAnalysis ? (
                <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-zinc-200">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 px-2 py-1">Zona vocal: {statusLabel(tessituraAnalysis.status)}</span>
                    <span className="rounded-full border border-white/10 px-2 py-1">Nipe sugerido: {voiceLabel(tessituraAnalysis.suggestedRange)}</span>
                    {tessituraAnalysis.suggestedOctaveShift !== 0 ? <span className="rounded-full border border-gold-400/30 px-2 py-1 text-gold-200">Oitava: {tessituraAnalysis.suggestedOctaveShift > 0 ? "+1" : "-1"}</span> : null}
                  </div>
                  <p className="mt-2 text-zinc-300">{tessituraAnalysis.message}</p>
                  <p className="mt-1 text-zinc-500">
                    Faixa: {midiRange ? `${midiToNoteName(midiRange.min)} → ${midiToNoteName(midiRange.max)}` : "não analisada"} • Após ajuste: {midiToNoteName(tessituraAnalysis.targetMidiRange.min)} → {midiToNoteName(tessituraAnalysis.targetMidiRange.max)}
                  </p>

                  {reinterpretation ? (
                    <div className="mt-3 rounded-xl border border-gold-400/20 bg-gold-400/10 p-3">
                      <p className="font-medium text-gold-200">{reinterpretation.title}</p>
                      <p className="mt-1 text-gold-100/80">{manualInterpretation ?? reinterpretation.description}</p>
                      <button
                        type="button"
                        onClick={applyReinterpretation}
                        className="mt-3 rounded-lg border border-gold-400/30 bg-black/20 px-3 py-2 text-xs font-medium text-gold-100 hover:bg-black/30"
                      >
                        {reinterpretation.button}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : selectedFile ? (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-zinc-400">
                  Tessitura ainda não analisada para esta voz. Analise no painel admin para liberar a leitura inteligente.
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
