"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

type DeleteTeamButtonProps = {
  teamId: string;
  compact?: boolean;
};

export function DeleteTeamButton({ teamId, compact = false }: DeleteTeamButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = deleting || isPending;

  async function remove() {
    if (busy) return;
    const confirmed = window.confirm("Excluir esta equipe? Ela será arquivada e não aparecerá mais nos templates.");
    if (!confirmed) return;

    setDeleting(true);
    setMessage("Excluindo equipe...");
    try {
      const response = await fetch(`/api/ministerio/equipes/${teamId}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível excluir a equipe.");
      setMessage("Equipe excluída.");
      startTransition(() => {
        router.push("/ministerio/equipes");
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao excluir equipe.");
      setDeleting(false);
    }
  }

  return (
    <div className={compact ? "" : "grid gap-2"}>
      {message && !compact ? <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">{message}</div> : null}
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className={`${compact ? "w-full justify-center" : "w-fit"} inline-flex items-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {busy ? "Excluindo..." : "Excluir equipe"}
      </button>
    </div>
  );
}
