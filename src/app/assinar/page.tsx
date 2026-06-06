import Link from "next/link";
import { redirect } from "next/navigation";

import { SubscribeButton } from "@/components/public/subscribe-button";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPlans } from "@/lib/data/plans";
import { OFFICIAL_PLANS } from "@/lib/data/official-plans";

export default async function AssinarPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [plans, user, params] = await Promise.all([getPlans(), getCurrentUser(), searchParams]);
  const selectedPlan = typeof params?.plan === "string" ? params.plan.toLowerCase() : "premium";
  const visiblePlans = plans.filter((p) => ["free", "plus", "premium"].includes(p.slug) && p.status === "active");

  if (!user) {
    redirect(`/cadastro?plan=${encodeURIComponent(selectedPlan)}&redirect=${encodeURIComponent(`/assinar?plan=${selectedPlan}`)}`);
  }

  return (
    <PublicAppShell>
      <main className="relative z-10 min-h-screen overflow-x-hidden bg-[#04050a] px-4 pb-10 pt-24 text-white md:px-8 md:pt-28">
        <section className="mx-auto w-full max-w-7xl">
          <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#171327] to-[#0b0d18] p-6 shadow-[0_25px_90px_rgba(168,85,247,0.23)] md:p-10">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Assinatura Harmomus</p>
            <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Escolha o plano ideal para o seu momento vocal.</h1>
            <p className="mt-4 max-w-3xl text-sm text-zinc-200 md:text-base">Do acesso gratuito até a experiência premium completa, com todos os tons, pedidos e prioridade de conteúdo para seu ministério.</p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {OFFICIAL_PLANS.map((content) => {
              const slug = content.slug;
              const plan = visiblePlans.find((item) => item.slug === slug);
              if (!plan) return null;
              const popular = content.popular;
              const highlighted = selectedPlan === slug;

              return (
                <article key={plan.id} className={`relative overflow-hidden rounded-3xl border p-6 md:p-7 ${popular ? "border-fuchsia-300/70 bg-gradient-to-b from-fuchsia-500/20 via-[#1a1332] to-[#0a0f1f] shadow-[0_25px_80px_rgba(217,70,239,0.30)]" : "border-white/20 bg-white/[0.05]"}`}>
                  {popular ? <span className="absolute right-5 top-4 rounded-full bg-fuchsia-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]">Mais popular</span> : null}
                  {highlighted ? <span className="mb-3 inline-flex rounded-full border border-cyan-300/60 bg-cyan-500/15 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100">Plano selecionado</span> : null}
                  <p className="text-xs uppercase tracking-[0.16em] text-cyan-100">Plano {plan.name}</p>
                  <h2 className="mt-1 text-3xl font-bold">{content.price}</h2>
                  {content.offer ? <p className="mt-1 text-sm font-medium text-emerald-300">Oferta: {content.offer}</p> : <p className="mt-1 text-sm text-zinc-300">Sem fidelidade</p>}
                  <p className="mt-3 text-sm text-zinc-200">{plan.description}</p>

                  <ul className="mt-6 space-y-2.5">
                    {content.features.map(({ label, included }) => (
                      <li key={label} className="flex items-start gap-2 text-sm text-zinc-100">
                        <span className={`mt-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${included ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>{included ? "✓" : "✕"}</span>
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <SubscribeButton
                      planSlug={slug as "free" | "plus" | "premium"}
                      label={content.cta}
                      className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-80 ${popular ? "bg-gradient-to-r from-cyan-300 to-fuchsia-300 text-slate-950 hover:opacity-90" : "border border-white/30 bg-white/10 hover:bg-white/20"}`}
                    />
                  </div>
                </article>
              );
            })}
          </div>

          <section className="mt-8 rounded-3xl border border-cyan-300/30 bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10 p-6">
            <h2 className="text-2xl font-semibold">Plano Ministerial</h2>
            <p className="mt-2 text-zinc-200">Ideal para ministérios de louvor que desejam preparar toda a equipe com acesso Premium.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <a href="/checkout?plan=ministry_10" className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">Até 10 integrantes — R$397/mês</a>
              <a href="/checkout?plan=ministry_20" className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">Até 20 integrantes — R$697/mês</a>
              <a href="/checkout?plan=ministry_40" className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">Até 40 integrantes — R$1.297/mês</a>
              <a href="mailto:focoemcanto@gmail.com?subject=Plano%20Ministerial%20Harmomus" className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/10 px-4 py-3">Acima de 40 — Falar com suporte</a>
            </div>
          </section>

          <div className="mt-8 text-center">
            <Link href="/todos-os-kits" className="text-sm text-cyan-200 hover:text-cyan-100">Ou volte para explorar todos os kits</Link>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
