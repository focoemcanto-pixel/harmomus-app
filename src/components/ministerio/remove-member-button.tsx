"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";

export function RemoveMemberButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function removeMember() {
    if (removing) return;

    setRemoving(true);
    setError("");

    try {
      const form = new FormData();
      form.set("member_id", memberId);

      const response = await fetch("/api/ministerio/remove", {
        method: "POST",
        body: form,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error("Não foi possível remover o integrante agora.");
      }

      window.location.href = response.url || "/ministerio";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o integrante.");
      setRemoving(false);
    }
  }

  const modal = open && mounted ? createPortal(
    <div
      className="fixed inset-0 z-[99999] grid min-h-[100dvh] place-items-center overflow-y-auto bg-black/75 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-member-title"
      onClick={() => !removing && setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-rose-300/25 bg-[#080d1b] shadow-[0_30px_120px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-rose-200">Remoção de acesso</p>
            <h2 id="remove-member-title" className="mt-2 text-2xl font-semibold text-white">Remover integrante?</h2>
          </div>
          <button
            type="button"
            onClick={() => !removing && setOpen(false)}
            disabled={removing}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-sm leading-6 text-zinc-300">
          <p>
            Você está prestes a remover <strong className="text-white">{memberName}</strong> do plano ministerial.
          </p>
          <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-rose-50">
            <p className="font-semibold">O acesso Premium Ministerial será encerrado imediatamente.</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-rose-50/90">
              <li>A vaga será liberada no plano.</li>
              <li>O integrante perderá os benefícios Premium do ministério.</li>
              <li>A conta Harmomus continuará existindo normalmente.</li>
            </ul>
          </div>
          {error ? <p className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 p-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => !removing && setOpen(false)}
            disabled={removing}
            className="h-12 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={removeMember}
            disabled={removing}
            className="h-12 rounded-xl bg-rose-500 px-5 text-sm font-bold text-white transition hover:bg-rose-400 disabled:cursor-wait disabled:opacity-70 sm:min-w-[190px]"
          >
            {removing ? "Removendo..." : "Remover integrante"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20"
        aria-label="Remover integrante"
      >
        <Trash2 className="h-3.5 w-3.5" /> Remover
      </button>
      {modal}
    </>
  );
}
