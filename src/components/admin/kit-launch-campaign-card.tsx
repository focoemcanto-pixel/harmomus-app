"use client";

import { useState } from "react";

export function KitLaunchCampaignCard({ kitId, published }: { kitId: string; published: boolean }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createCampaign() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/comunicacao/campaigns/create-from-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Falha ao criar campanha.");

      setMessage("Campanha de lançamento criada como rascunho. Redirecionando para revisão...");
      window.setTimeout(() => {
        window.location.href = "/admin/comunicacao/campaigns";
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar campanha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-5 shadow-premium">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Campanha automática</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Criar campanha de lançamento deste kit</h2>
          <p className="mt-1 text-sm text-muted">
            Gera um rascunho com link, capa, mensagem e segmentação Plus/Premium para revisar antes do disparo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void createCampaign()}
          disabled={loading || !published}
          className="rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Criando campanha..." : published ? "Criar campanha" : "Publique o kit primeiro"}
        </button>
      </div>
      {message ? <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{message}</p> : null}
      {error ? <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p> : null}
    </section>
  );
}
