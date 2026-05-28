"use client";

const CANCEL_CONFIRMATION_MESSAGE =
  "Tem certeza que deseja cancelar sua assinatura ao final do ciclo atual?";

export function CancelSubscriptionButton() {
  return (
    <button
      className="rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200"
      onClick={(event) => {
        if (!window.confirm(CANCEL_CONFIRMATION_MESSAGE)) {
          event.preventDefault();
        }
      }}
      type="submit"
    >
      Cancelar assinatura
    </button>
  );
}
