"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, Plus } from "lucide-react";

type Kit = { id: string; slug: string; name: string; artist: string | null; cover_url: string | null };

export function AddKitCard({ kit, repertoireId, alreadyAdded }: { kit: Kit; repertoireId: string; alreadyAdded: boolean }) {
  const [added, setAdded] = useState(alreadyAdded);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (saving || added) return;
    setError(null);
    setSaving(true);
    setAdded(true);
    try {
      const response = await fetch(`/api/ministerio/repertorios/${repertoireId}/kits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitId: kit.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível adicionar o kit.");
    } catch (err) {
      setAdded(false);
      setError(err instanceof Error ? err.message : "Erro ao adicionar kit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`overflow-hidden rounded-3xl border border-white/10 bg-black/20 transition hover:border-cyan-300/35 hover:bg-white/[0.045] ${saving ? "opacity-80" : ""}`}>
      <div className="aspect-video bg-white/5">
        {kit.cover_url ? <img src={kit.cover_url} alt={kit.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-sm text-zinc-500">Harmomus</div>}
      </div>
      <div className="p-4">
        {error ? <div className="mb-3 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-xs text-red-100">{error}</div> : null}
        <h3 className="text-lg font-semibold text-white">{kit.name}</h3>
        <p className="mt-1 text-sm text-zinc-400">{kit.artist || "Kit vocal"}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link prefetch href={`/biblioteca/${kit.slug}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 active:scale-[0.98]">Ver kit</Link>
          {added ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100"><Check className="h-3.5 w-3.5" /> {saving ? "Adicionando..." : "Adicionado"}</span>
          ) : (
            <button type="button" onClick={add} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {saving ? "Adicionando..." : "Adicionar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
