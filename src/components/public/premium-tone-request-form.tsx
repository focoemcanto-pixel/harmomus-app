"use client";

import { useMemo, useState } from "react";
import { Loader2, Send, Wand2 } from "lucide-react";

type KitOption = {
  id: string;
  slug: string;
  name: string;
  artist: string;
};

export function PremiumToneRequestForm({
  kits,
  initialKitSlug,
  initialKitName,
}: {
  kits: KitOption[];
  initialKitSlug?: string;
  initialKitName?: string;
}) {
  const initialKit = kits.find((kit) => kit.slug === initialKitSlug) ?? null;
  const [music, setMusic] = useState(initialKit?.name ?? initialKitName ?? "");
  const [selectedKitSlug, setSelectedKitSlug] = useState(initialKit?.slug ?? initialKitSlug ?? "");
  const [tone, setTone] = useState("");
  const [voice, setVoice] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggestions = useMemo(() => {
    const query = music.trim().toLowerCase();
    if (!query || selectedKitSlug) return [];
    return kits
      .filter((kit) => `${kit.name} ${kit.artist}`.toLowerCase().includes(query))
      .slice(0, 6);
  }, [kits, music, selectedKitSlug]);

  function selectKit(kit: KitOption) {
    setMusic(kit.name);
    setSelectedKitSlug(kit.slug);
  }

  async function submit() {
    setStatus(null);

    if (!music.trim() || !tone.trim()) {
      setStatus({ type: "error", message: "Informe a música e o tom desejado." });
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/premium-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "tone",
        song_name: music,
        kit_slug: selectedKitSlug,
        desired_tone: tone,
        voice_part: voice,
        notes,
      }),
    });

    const result = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok) {
      setStatus({ type: "error", message: result.error ?? "Não foi possível enviar o pedido." });
      return;
    }

    setTone("");
    setVoice("");
    setNotes("");
    setStatus({ type: "success", message: "Pedido de tom enviado com sucesso. Você poderá acompanhar a produção pelo Harmomus." });
  }

  return (
    <form id="solicitar-tom" className="scroll-mt-28 rounded-[2rem] border border-emerald-400/20 bg-[#161918]/90 p-6">
      <h3 className="mb-5 flex items-center gap-3 text-2xl font-black text-white"><Wand2 />Solicitar tom</h3>

      <div className="grid gap-4">
        <label className="relative block text-sm font-bold text-zinc-200">
          Música *
          <input
            value={music}
            onChange={(event) => {
              setMusic(event.target.value);
              setSelectedKitSlug("");
              setStatus(null);
            }}
            className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring"
            placeholder="Digite o nome do kit"
            autoComplete="off"
          />
          {selectedKitSlug ? (
            <span className="mt-2 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
              Kit selecionado
            </span>
          ) : null}
          {suggestions.length ? (
            <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-emerald-400/20 bg-[#07110d] shadow-2xl">
              {suggestions.map((kit) => (
                <button
                  key={kit.id}
                  type="button"
                  onClick={() => selectKit(kit)}
                  className="block w-full border-b border-white/10 px-4 py-3 text-left transition last:border-b-0 hover:bg-emerald-400/10"
                >
                  <span className="block text-sm font-bold text-white">{kit.name}</span>
                  <span className="block text-xs text-zinc-400">{kit.artist}</span>
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <label className="block text-sm font-bold text-zinc-200">
          Tom desejado *
          <input value={tone} onChange={(e) => { setTone(e.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="Ex: C, D, Eb, F#" />
        </label>

        <label className="block text-sm font-bold text-zinc-200">
          Voz/nipe
          <input value={voice} onChange={(e) => { setVoice(e.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="Ex: todos, soprano, tenor, contralto" />
        </label>

        <label className="block text-sm font-bold text-zinc-200">
          Observações
          <input value={notes} onChange={(e) => { setNotes(e.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="Observações" />
        </label>
      </div>

      {status ? (
        <p className={`mt-4 rounded-2xl border p-3 text-sm ${status.type === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-rose-400/20 bg-rose-500/10 text-rose-100"}`}>
          {status.message}
        </p>
      ) : null}

      <button type="button" onClick={submit} disabled={isSubmitting} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-300 font-black uppercase tracking-[0.16em] text-black disabled:cursor-wait disabled:opacity-70">
        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {isSubmitting ? "Enviando..." : "Enviar pedido de tom"}
      </button>
    </form>
  );
}
