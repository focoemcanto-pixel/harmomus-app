"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";

type TeamListCardProps = {
  team: {
    id: string;
    name: string;
    description?: string | null;
  };
};

export function TeamListCard({ team }: TeamListCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = opening || isPending || deleting;
  const href = `/ministerio/equipes/${team.id}`;

  if (hidden) return null;

  function openTeam() {
    if (busy) return;
    setError(null);
    setOpening(true);
    router.prefetch(href);
    startTransition(() => router.push(href));
  }

  async function deleteTeam() {
    if (busy) return;
    const confirmed = window.confirm(`Excluir a equipe "${team.name}"?`);
    if (!confirmed) return;
    setError(null);
    setDeleting(true);
    setHidden(true);
    try {
      const response = await fetch(`/api/ministerio/equipes/${team.id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível excluir a equipe.");
      startTransition(() => router.refresh());
    } catch (err) {
      setHidden(false);
      setError(err instanceof Error ? err.message : "Erro ao excluir equipe.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className={`rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-cyan-300/40 hover:bg-white/[0.055] ${busy ? "opacity-80" : ""}`}>
      {error ? <div className="mb-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      <button type="button" onClick={openTeam} onMouseEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)} className="block w-full text-left active:scale-[0.99]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{team.name}</h3>
            <p className="mt-2 text-sm text-zinc-400">{team.description || "Sem descrição"}</p>
          </div>
          {opening || isPending ? <Loader2 className="h-5 w-5 animate-spin text-cyan-200" /> : <ArrowRight className="h-5 w-5 text-cyan-200" />}
        </div>
        {(opening || isPending) ? <p className="mt-4 text-sm font-semibold text-cyan-100">Abrindo equipe...</p> : null}
      </button>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={openTeam} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75">
          {opening || isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {opening || isPending ? "Abrindo..." : "Abrir"}
        </button>
        <button type="button" onClick={deleteTeam} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75">
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          {deleting ? "Excluindo..." : "Excluir"}
        </button>
      </div>
    </article>
  );
}
