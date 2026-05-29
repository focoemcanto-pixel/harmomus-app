"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";

export function RemoveMemberButton({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [open, setOpen] = useState(false);

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

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="remove-member-title">
          <div className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-rose-300/25 bg-[#080d1b] shadow-[0_30px_120px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-rose-200">Remoção de acesso</p>
                <h2 id="remove-member-title" className="mt-2 text-2xl font-semibold text-white">Remover integrante?</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 p-2 text-zinc-300 hover:bg-white/10" aria-label="Fechar">
                <X className="h-4 w-4" />
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
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-white/10 p-5 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/10">
                Cancelar
              </button>
              <form action="/api/ministerio/remove" method="post">
                <input type="hidden" name="member_id" value={memberId} />
                <button className="w-full rounded-xl bg-rose-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-rose-400 sm:w-auto">
                  Remover integrante
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
