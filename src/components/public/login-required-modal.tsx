"use client";

import Link from "next/link";

export function LoginRequiredModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-surface p-6">
        <h3 className="text-xl font-semibold text-white">Faça login para continuar</h3>
        <p className="mt-2 text-sm text-zinc-300">Visitantes podem navegar, mas para tocar o áudio completo é necessário login.</p>
        <div className="mt-5 flex gap-3">
          <Link href="/login" className="rounded-lg border border-gold-400/50 px-4 py-2 text-gold-300">Ir para login</Link>
          <button onClick={onClose} className="rounded-lg border border-white/20 px-4 py-2 text-zinc-200">Fechar</button>
        </div>
      </div>
    </div>
  );
}
