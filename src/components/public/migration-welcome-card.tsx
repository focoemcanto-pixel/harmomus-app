"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { CurrentUserAccessContext } from "@/lib/auth/current-user";

const DISMISS_KEY = "harmomus:migration-welcome-dismissed:v1";

function getPlanLabel(slug: string) {
  if (slug === "premium") return "Premium";
  if (slug === "plus") return "Plus";
  return "Free";
}

function FeaturePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] md:text-sm">
      {children}
    </span>
  );
}

export function MigrationWelcomeCard({ context }: { context: CurrentUserAccessContext }) {
  const [isVisible, setIsVisible] = useState(false);
  const profile = context.profile as any;
  const isMigratedUser = Boolean(profile?.migrated_from_pms || profile?.migration_completed_at || profile?.legacy_pms_member_id);
  const planLabel = useMemo(() => getPlanLabel(context.effectiveSlug), [context.effectiveSlug]);

  useEffect(() => {
    if (!isMigratedUser) return;
    try {
      const dismissed = window.localStorage.getItem(DISMISS_KEY);
      if (!dismissed) setIsVisible(true);
    } catch {
      setIsVisible(true);
    }
  }, [isMigratedUser]);

  if (!isMigratedUser || !isVisible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // ignore storage errors
    }
    setIsVisible(false);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pb-3 md:px-8 md:pb-5">
      <div className="relative overflow-hidden rounded-[2rem] border border-cyan-200/20 bg-gradient-to-br from-[#07111f] via-[#170d28] to-[#060712] p-5 shadow-[0_30px_90px_rgba(34,211,238,0.16)] md:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-200/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-100">
                Bem-vindo à nova fase
              </span>
              <span className="rounded-full border border-fuchsia-200/20 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold text-fuchsia-100">
                Seu plano atual: {planLabel}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-bold tracking-tight text-white md:text-4xl">
              O Harmomus está de cara nova.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-200 md:text-base">
              Sua conta foi trazida para uma experiência mais rápida, moderna e inteligente. Agora você pode explorar novos recursos criados para facilitar seus estudos, ensaios e organização vocal.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <FeaturePill>Harmomus IA</FeaturePill>
              <FeaturePill>Análise de tessitura</FeaturePill>
              <FeaturePill>Planos ministeriais</FeaturePill>
              <FeaturePill>Repertório de escala</FeaturePill>
              <FeaturePill>Kits vocais organizados</FeaturePill>
              <FeaturePill>Player mais rápido</FeaturePill>
            </div>
          </div>

          <div className="relative min-w-full rounded-3xl border border-white/10 bg-white/[0.05] p-4 lg:min-w-[330px]">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Comece por aqui</p>
            <div className="mt-4 grid gap-2 text-sm text-zinc-200">
              <Link href="/todos-os-kits" onClick={dismiss} className="rounded-2xl bg-cyan-300 px-4 py-3 text-center font-bold text-slate-950 transition hover:bg-cyan-200">
                Explorar novos kits
              </Link>
              <Link href="/assinatura" onClick={dismiss} className="rounded-2xl border border-white/15 bg-white/[0.04] px-4 py-3 text-center font-semibold text-white transition hover:bg-white/10">
                Ver minha assinatura
              </Link>
              <button type="button" onClick={dismiss} className="rounded-2xl px-4 py-3 text-center text-xs font-semibold text-zinc-400 transition hover:text-white">
                Fechar e continuar depois
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
