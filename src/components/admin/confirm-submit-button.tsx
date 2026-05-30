"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmSubmitButtonProps {
  children: React.ReactNode;
  message: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  title?: string;
  confirmLabel?: string;
}

export function ConfirmSubmitButton({
  children,
  message,
  className,
  formAction,
  title = "Confirmar ação sensível",
  confirmLabel = "Confirmar ação",
}: ConfirmSubmitButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
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
                  <h2 id="admin-confirm-title" className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-red-100/80">{message}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar confirmação"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 p-5 sm:p-6">
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-100/80">
                Revise antes de continuar. Esta ação pode alterar dados importantes do Harmomus e não deve ser executada por engano.
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  formAction={formAction}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-red-400/60 bg-red-500/20 px-5 text-sm font-semibold text-red-100 transition hover:bg-red-500/30"
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
