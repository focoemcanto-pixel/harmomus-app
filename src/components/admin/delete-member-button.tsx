"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

type DeleteMemberButtonProps = {
  memberId: string;
  memberLabel: string;
  className?: string;
};

export function DeleteMemberButton({ memberId, memberLabel, className }: DeleteMemberButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDeleting) setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDeleting, open]);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/membros/${encodeURIComponent(memberId)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Não foi possível excluir este membro. Tente novamente em instantes.");
      }

      setOpen(false);
      startTransition(() => router.refresh());
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Erro inesperado ao excluir este membro.");
    } finally {
      setIsDeleting(false);
    }
  }

  function closeModal() {
    if (isDeleting) return;
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Excluir
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={closeModal}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-member-title"
            className="w-full max-w-xl overflow-hidden rounded-3xl border border-red-500/30 bg-gradient-to-br from-[#17090b] via-[#101114] to-background shadow-2xl shadow-black/60"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-red-500/20 p-5 sm:p-6">
              <div className="flex gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-400/40 bg-red-500/10 text-red-200 shadow-lg shadow-red-950/40">
                  <AlertTriangle size={22} />
                </span>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-200/80">Confirmação necessária</p>
                  <h2 id="delete-member-title" className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    Excluir membro definitivamente
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-red-100/80">
                    Excluir definitivamente o membro {memberLabel}? Esta ação remove perfil, assinatura, favoritos, playlists e o login do Auth.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={isDeleting}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Fechar confirmação"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100/80">
                Revise antes de continuar. A exclusão é executada por um endpoint autenticado, revalida a lista e atualiza a tabela automaticamente após o sucesso.
              </div>

              {error ? (
                <p className="rounded-2xl border border-red-400/40 bg-red-500/15 p-3 text-sm text-red-100" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isDeleting}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-red-400/60 bg-red-500/20 px-5 text-sm font-semibold text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {isDeleting ? "Excluindo..." : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
