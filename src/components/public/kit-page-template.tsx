"use client";

import { useMemo, useState } from "react";

import { AccessCounter } from "@/components/public/access-counter";
import { HarmomusPlayer } from "@/components/public/harmomus-player";
import { ToneSelector } from "@/components/public/tone-selector";
import { UpgradeModal } from "@/components/public/upgrade-modal";
import { KitActionsMenu } from "@/components/public/kit-actions-menu";
import { VoiceSelector } from "@/components/public/voice-selector";
import type { PublicKit, UserTier, VoiceType } from "@/lib/data/public-kits";

interface KitPageTemplateProps {
  kit: PublicKit;
}

const tierOrder: UserTier[] = ["guest", "free", "plus", "premium"];

export function KitPageTemplate({ kit }: KitPageTemplateProps) {
  const [selectedTone, setSelectedTone] = useState(kit.tones[0]?.tone ?? "");
  const [selectedVoice, setSelectedVoice] = useState<VoiceType>("todos");
  const [accessCount, setAccessCount] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const userTier: UserTier = "free"; // TODO: integrar assinatura real via sessão + subscriptions.
  const requiredTier = (kit.requiredPlan?.slug as UserTier | undefined) ?? "guest";

  const lockedToneSet = useMemo(() => {
    if (tierOrder.indexOf(userTier) >= tierOrder.indexOf(requiredTier)) return new Set<string>();
    return new Set(kit.tones.slice(1).map((t) => t.tone));
  }, [kit.tones, requiredTier, userTier]);

  const currentTone = kit.tones.find((t) => t.tone === selectedTone) ?? kit.tones[0];
  const selectedFile = currentTone?.voices[selectedVoice] ?? currentTone?.voices.todos ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8">
      <section className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium backdrop-blur md:p-8">
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <img src={kit.coverUrl ?? "https://placehold.co/600x600/101114/f4f4f5?text=Harmomus"} alt={kit.name} className="aspect-square w-full rounded-xl border border-white/10 object-cover" />
          <div>
            <div className="mb-2 flex justify-end"><KitActionsMenu kitName={kit.name} kitSlug={kit.slug} categorySlug={kit.category?.slug} /></div>
            <p className="text-xs uppercase tracking-wider text-gold-300">{kit.category?.name ?? "Sem categoria"}</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{kit.name}</h1>
            <p className="mt-1 text-zinc-300">{kit.artist}</p>
            {kit.requiredPlan && <span className="mt-3 inline-flex rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-1 text-xs text-gold-300">Plano necessário: {kit.requiredPlan.name}</span>}
            <p className="mt-4 text-sm text-zinc-300">{kit.description ?? "Sem descrição."}</p>

            <div className="mt-5 space-y-3">
              <ToneSelector
                tones={kit.tones.map((tone) => tone.tone)}
                selectedTone={selectedTone}
                lockedToneSet={lockedToneSet}
                onSelectTone={(tone) => {
                  if (lockedToneSet.has(tone)) {
                    setUpgradeOpen(true);
                    return;
                  }
                  setSelectedTone(tone);
                  setAccessCount((prev) => prev + 1);
                }}
              />
              <VoiceSelector selectedVoice={selectedVoice} onSelectVoice={setSelectedVoice} />
              <HarmomusPlayer src={selectedFile?.publicUrl ?? null} title={`Tom ${selectedTone} • Voz ${selectedVoice}`} />
              <AccessCounter value={accessCount} />
              {kit.tones.length < 12 ? <p className="text-xs text-blue-200">Outros tons em breve.</p> : null}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-4">
          <h2 className="mb-3 text-lg font-medium text-white">Letra</h2>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">{kit.lyrics ?? "Letra não disponível."}</pre>
        </div>
      </section>
      <UpgradeModal open={upgradeOpen} requiredPlanName={kit.requiredPlan?.name ?? "Premium"} onClose={() => setUpgradeOpen(false)} />
    </main>
  );
}
