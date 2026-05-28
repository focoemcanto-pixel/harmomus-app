"use client";

import { useRef, useState } from "react";

export function CancelSubscriptionButton() {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  function confirmCancel() {
    setIsOpen(false);
    buttonRef.current?.form?.requestSubmit();
  }

  return (
    <>
      <button
        ref={buttonRef}
        className="rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:border-red-300/70 hover:bg-red-500/20"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen(true);
        }}
        type="button"
      >
        Cancelar assinatura
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/15 bg-gradient-to-br from-[#101525] via-[#160d27] to-[#080c18] p-6 text-white shadow-[0_25px_90px_rgba(0,0,0,0.55)]">
            <div className="mb-4 inline-flex rounded-full border border-red-300/30 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-100">
              Cancelamento
            </div>
            <h3 className="text-2xl font-semibold">Cancelar renovação automática?</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Sua assinatura será cancelada apenas no final do ciclo atual. Até lá, você continua com acesso ao plano contratado.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Manter assinatura
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                className="rounded-xl border border-red-300/40 bg-red-500/15 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/25"
              >
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
