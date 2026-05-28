"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Crown, Users, X } from "lucide-react";

export function MinistryOnboardingModal({ ministryId, remainingSeats }: { ministryId: string; remainingSeats: number }) {
  const storageKey = `harmomus:ministry-onboarding:${ministryId}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const alreadySeen = window.localStorage.getItem(storageKey);
    if (!alreadySeen) setOpen(true);
  }, [storageKey]);

  function close() {
    window.localStorage.setItem(storageKey, new Date().toISOString());
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-cyan-300/25 bg-gradient-to-br from-[#08111f] via-[#170e2a] to-[#06111f] p-6 text-white shadow-[0_30px_120px_rgba(34,211,238,0.22)] md:p-8">
        <button
          type="button"
          onClick={close}
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <Crown className="h-4 w-4" /> Plano Ministerial Ativo
        </div>

        <h2 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">
          Sua Central Ministerial está pronta
        </h2>

        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-300 md:text-base">
          Agora você pode liberar acesso Premium para os integrantes do seu ministério. Convide os membros pelo e-mail e acompanhe vagas, pendências e acessos em um só lugar.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <Users className="h-5 w-5 text-cyan-200" />
            <p className="mt-3 text-xs uppercase tracking-[0.14em] text-zinc-400">Vagas livres</p>
            <p className="mt-1 text-2xl font-semibold text-white">{remainingSeats}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 md:col-span-2">
            <p className="text-sm font-semibold text-white">Poderes do responsável</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Você mantém acesso Premium completo e pode solicitar novas músicas e tons. Os membros convidados acessam os kits Premium, mas não enviam solicitações.
            </p>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="#convidar-integrante"
            onClick={close}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-400 px-5 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(34,211,238,0.18)]"
          >
            Cadastrar integrantes agora
          </Link>
          <button
            type="button"
            onClick={close}
            className="h-12 rounded-2xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Fazer isso depois
          </button>
        </div>
      </div>
    </div>
  );
}
