"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

type DeleteScaleButtonProps = {
  repertoireId: string;
};

export function DeleteScaleButton({ repertoireId }: DeleteScaleButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function deleteScale() {
    if (!confirming) {
      setConfirming(true);
      setMessage("");
      return;
    }

    startTransition(async () => {
      setMessage("");

      const response = await fetch(`/api/ministerio/repertorios/${repertoireId}`, {
        method: "DELETE",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(payload?.error || "Não foi possível excluir a escala.");
        setConfirming(false);
        return;
      }

      router.replace("/ministerio/repertorios");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={deleteScale}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-2xl border border-red-300/25 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 disabled:opacity-70"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {confirming ? "Confirmar exclusão" : "Excluir escala"}
      </button>
      {confirming && !pending ? <button type="button" onClick={() => setConfirming(false)} className="text-xs font-semibold text-zinc-400 transition hover:text-zinc-200">Cancelar</button> : null}
      {message ? <p className="max-w-xs text-right text-xs text-red-200">{message}</p> : null}
    </div>
  );
}
