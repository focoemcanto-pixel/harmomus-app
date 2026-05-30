"use client";

import Link from "next/link";

interface UpgradeRequiredModalProps {
  open: boolean;
  title: string;
  message: string;
  ctaLabel: string;
  ctaHref: string;
  onClose: () => void;
}

export function UpgradeRequiredModal({ open, title, message, ctaLabel, ctaHref, onClose }: UpgradeRequiredModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] grid min-h-[100dvh] place-items-center overflow-y-auto bg-black/80 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-[#101629] to-[#090d1a] p-6 shadow-[0_24px_90px_rgba(6,182,212,0.28)]">
        <h3 className="text-xl font-semibold text-white">{title || "Libere todos os recursos Premium"}</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-200">{message || "Experimente 7 dias grátis e acesse todos os tons, vozes, playlists e recursos avançados do Harmomus."}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href={ctaHref || "/assinar?plan=premium"} className="inline-flex flex-1 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-400 to-cyan-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:brightness-105">
            {ctaLabel || "Atualizar e testar grátis por 7 dias"}
          </Link>
          <button onClick={onClose} className="rounded-lg border border-white/20 px-4 py-3 text-sm text-zinc-200 transition hover:bg-white/5">
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
