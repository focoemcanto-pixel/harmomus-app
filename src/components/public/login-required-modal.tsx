"use client";

import Link from "next/link";

export function LoginRequiredModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/20 bg-surface p-6">
        <h3 className="text-xl font-semibold text-white">Entre para ouvir este kit</h3>
        <p className="mt-2 text-sm text-zinc-300">Visitantes podem navegar, mas para dar play e salvar progresso você precisa entrar.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href="/login" className="inline-flex flex-1 items-center justify-center rounded-lg border border-gold-400/50 bg-gold-400/10 px-4 py-2 text-gold-200">Entrar</Link>
          <Link href="/assinar" className="inline-flex flex-1 items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-zinc-200">Criar conta grátis</Link>
          <button onClick={onClose} className="rounded-lg border border-white/20 px-4 py-2 text-zinc-300">Agora não</button>
        </div>
      </div>
    </div>
  );
}
