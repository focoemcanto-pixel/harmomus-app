"use client";

import { useState } from "react";
import { AccessCounter } from "@/components/public/access-counter";
import { AccessStatusBadge } from "@/components/public/access-status-badge";
import { HarmomusPlayer } from "@/components/public/harmomus-player";
import { KitActionsMenu } from "@/components/public/kit-actions-menu";
import { LoginRequiredModal } from "@/components/public/login-required-modal";
import { ToneSelector } from "@/components/public/tone-selector";
import { UpgradeRequiredModal } from "@/components/public/upgrade-required-modal";
import { VoiceSelector } from "@/components/public/voice-selector";
import type { PublicKit, VoiceType } from "@/lib/data/public-kits";

interface KitPageTemplateProps {
  kit: PublicKit;
  accessContext: any;
}

export function KitPageTemplate({ kit, accessContext }: KitPageTemplateProps) {
  const [selectedTone, setSelectedTone] = useState(kit.tones[0]?.tone ?? "");
  const [selectedVoice, setSelectedVoice] = useState<VoiceType>("todos");
  const [loginOpen, setLoginOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeMessage, setUpgradeMessage] = useState("Faça upgrade para continuar.");

  const currentTone = kit.tones.find((t) => t.tone === selectedTone) ?? kit.tones[0];
  const selectedFile = currentTone?.voices[selectedVoice] ?? currentTone?.voices.todos ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] px-4 py-6 md:px-8 md:py-10">
      <section className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium backdrop-blur md:p-8">
        <div className="grid gap-8 md:grid-cols-[280px_1fr] md:gap-10">
          <img src={kit.coverUrl ?? "https://placehold.co/600x600/101114/f4f4f5?text=Harmomus"} alt={kit.name} className="aspect-square w-full rounded-xl border border-white/10 object-cover" />
          <div>
            <div className="mb-2 flex justify-end"><KitActionsMenu kitName={kit.name} kitSlug={kit.slug} categorySlug={kit.category?.slug} /></div>
            <h1 className="mt-2 text-3xl font-semibold text-white">{kit.name}</h1>
            <div className="mt-3"><AccessStatusBadge planSlug={accessContext.effectiveSlug} /></div>
            <div className="mt-5 space-y-3">
              <ToneSelector tones={kit.tones.map((tone) => tone.tone)} selectedTone={selectedTone} onSelectTone={(tone) => {
                if (!accessContext.tone.allowed && tone !== kit.tones[0]?.tone) {
                  setUpgradeMessage("Troca de tom liberada apenas para Premium nesta V1.");
                  setUpgradeOpen(true);
                  return;
                }
                setSelectedTone(tone);
              }} />
              <VoiceSelector selectedVoice={selectedVoice} onSelectVoice={setSelectedVoice} />
              <HarmomusPlayer src={selectedFile?.streamUrl ?? null} title={`Tom ${selectedTone} • Voz ${selectedVoice}`} canPlay={accessContext.play.allowed} onBlocked={() => {
                if (accessContext.play.reason === "guest") setLoginOpen(true);
                else {
                  setUpgradeMessage(accessContext.play.reason === "free_limit" ? "Você atingiu o limite de 5 kits em 24h no plano free." : "Seu plano atual não atende ao kit.");
                  setUpgradeOpen(true);
                }
              }} />
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
      <UpgradeRequiredModal open={upgradeOpen} message={upgradeMessage} onClose={() => setUpgradeOpen(false)} />
    </main>
  );
}
