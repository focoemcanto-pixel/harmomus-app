"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

export function ReadyToggleCard({ repertoireId, initialReady, canConfirmReady }: { repertoireId: string; initialReady: boolean; canConfirmReady: boolean }) {
  const [ready, setReady] = useState(initialReady);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    if (saving || (!ready && !canConfirmReady)) return;
    const next = !ready;
    const previous = ready;
    setReady(next);
    setSaving(true);
    setMessage(next ? "Confirmando prontidão..." : "Desmarcando prontidão...");
    try {
      const response = await fetch(`/api/meus-repertorios/${repertoireId}/ready`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ready: next }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível salvar.");
      setMessage(next ? "Pronto confirmado." : "Prontidão desmarcada.");
      window.setTimeout(() => setMessage(null), 1000);
    } catch (error) {
      setReady(previous);
      setMessage(error instanceof Error ? error.message : "Erro ao salvar prontidão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-3xl border p-6 transition ${ready ? "border-emerald-300/30 bg-emerald-400/[0.08]" : canConfirmReady ? "border-cyan-300/25 bg-cyan-400/[0.08]" : "border-white/10 bg-white/[0.04]"}`}>
      {message ? <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm text-cyan-50">{message}</div> : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Confirmação final</p>
          <h2 className="mt-2 text-2xl font-black text-white">{ready ? "Você confirmou que está pronto" : "Estou pronto para tocar esta escala"}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
            {ready ? "Sua liderança poderá acompanhar que você concluiu o estudo desta escala." : canConfirmReady ? "Todas as músicas foram marcadas como Estudei OK. Agora você pode confirmar que está pronto." : "Marque todas as músicas como Estudei OK para liberar esta confirmação."}
          </p>
        </div>
        <button type="button" onClick={toggle} disabled={saving || (!ready && !canConfirmReady)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 md:w-fit">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {saving ? "Salvando..." : ready ? "Desmarcar pronto" : "Confirmar pronto"}
        </button>
      </div>
    </div>
  );
}
