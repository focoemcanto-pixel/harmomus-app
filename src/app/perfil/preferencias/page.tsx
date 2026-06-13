"use client";

import Link from "next/link";
import { useState } from "react";

const PHRASE = "ENCERRAR";

export default function ProfilePreferencesPage() {
  const [phrase, setPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);

  async function submitRequest() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/profile/closure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: phrase, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível registrar a solicitação.");
      setScheduledFor(data?.scheduledFor ?? null);
      setMessage("Solicitação registrada. Você pode cancelar antes da data agendada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao registrar solicitação.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelRequest() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/profile/closure", { method: "PATCH" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível cancelar.");
      setScheduledFor(null);
      setPhrase("");
      setReason("");
      setMessage("Solicitação cancelada com sucesso.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao cancelar solicitação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#06080d] px-4 py-8 text-white">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_0_80px_rgba(244,63,94,0.08)]">
        <Link href="/perfil" className="text-sm font-semibold text-cyan-200">← Voltar ao perfil</Link>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.22em] text-rose-200">Preferências avançadas</p>
        <h1 className="mt-2 text-3xl font-black">Encerramento da conta</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-300">Essa solicitação agenda o encerramento para daqui a 7 dias. Durante esse prazo você pode cancelar.</p>

        {scheduledFor ? (
          <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-amber-100">
            <p className="font-bold">Solicitação agendada</p>
            <p className="mt-1 text-sm">Data: {new Date(scheduledFor).toLocaleDateString("pt-BR")}</p>
            <button type="button" onClick={cancelRequest} disabled={loading} className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{loading ? "Cancelando..." : "Cancelar solicitação"}</button>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4">
            <p className="text-sm text-zinc-200">Para continuar, digite exatamente:</p>
            <p className="mt-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm text-rose-100">{PHRASE}</p>
            <input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder={PHRASE} className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none ring-rose-300/30 focus:ring" />
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo opcional" className="mt-3 min-h-24 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm outline-none ring-rose-300/30 focus:ring" />
            <button type="button" onClick={submitRequest} disabled={phrase !== PHRASE || loading} className="mt-4 w-full rounded-xl bg-rose-500 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Registrando..." : "Registrar solicitação"}</button>
          </div>
        )}
        {message ? <p className="mt-4 text-sm text-zinc-200">{message}</p> : null}
      </section>
    </main>
  );
}
