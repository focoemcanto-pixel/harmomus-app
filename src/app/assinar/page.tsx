import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPlans } from "@/lib/data/plans";

const PLAN_CONTENT = {
  free: {
    price: "Grátis",
    cta: "Começar grátis",
    offer: null,
    features: [
      ["5 acessos diários a kits", true],
      ["Apenas tom original", true],
      ["Player limitado", true],
      ["Criação de playlists", true],
      ["Comunidade aberta", true],
      ["Troca de tonalidade", false],
      ["Solicitação de novos kits", false],
      ["Prioridade na confecção", false],
      ["Receber kits antecipadamente", false],
      ["Grupo exclusivo", false],
      ["Solicitação de novos tons", false],
    ],
  },
  plus: {
    price: "R$19/mês",
    cta: "Assinar Plus",
    offer: null,
    features: [
      ["Acesso ilimitado aos kits", true],
      ["Player completo", true],
      ["Apenas tom original", true],
      ["Catálogo completo", true],
      ["Criação de playlists", true],
      ["Comunidade aberta", true],
      ["Sugestões de conteúdos", true],
      ["Solicitação de novos kits", false],
      ["Prioridade na confecção", false],
      ["Receber kits antecipadamente", false],
      ["Grupo exclusivo", false],
      ["Solicitação de novos tons", false],
    ],
  },
  premium: {
    price: "R$39/mês",
    cta: "Experimentar grátis por 7 dias",
    offer: "7 dias grátis",
    features: [
      ["Acesso ilimitado aos kits", true],
      ["Todos os tons disponíveis", true],
      ["Troca de tonalidade", true],
      ["Catálogo completo", true],
      ["Criação de playlists", true],
      ["Solicitação de novos kits", true],
      ["Prioridade na confecção", true],
      ["Receber kits antecipadamente", true],
      ["Comunidade Harmomus + grupo Premium para pedidos", true],
      ["Solicitação de novos tons", true],
      ["Conteúdos extras", true],
      ["Votações internas", true],
      ["Selo Premium Harmomus", true],
    ],
  },
} as const;

export default async function AssinarPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [plans, user, params] = await Promise.all([getPlans(), getCurrentUser(), searchParams]);
  const selectedPlan = typeof params?.plan === "string" ? params.plan.toLowerCase() : "premium";
  const visiblePlans = plans.filter((p) => ["free", "plus", "premium"].includes(p.slug) && p.status === "active");

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#34184f_0%,#0a0b14_36%,#04050a_100%)] px-4 py-8 text-white md:px-8 md:py-10">
        <section className="mx-auto w-full max-w-7xl">
          <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-white/10 to-transparent p-6 shadow-[0_25px_90px_rgba(168,85,247,0.23)] md:p-10">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Assinatura Harmomus</p>
            <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Escolha o plano ideal para o seu momento vocal.</h1>
            <p className="mt-4 max-w-3xl text-sm text-zinc-200 md:text-base">Do acesso gratuito até a experiência premium completa, com todos os tons, pedidos e prioridade de conteúdo para seu ministério.</p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {(["free", "plus", "premium"] as const).map((slug) => {
              const plan = visiblePlans.find((item) => item.slug === slug);
              if (!plan) return null;
              const content = PLAN_CONTENT[slug];
              const popular = slug === "premium";
              const highlighted = selectedPlan === slug;

              return (
                <article key={plan.id} className={`relative overflow-hidden rounded-3xl border p-6 md:p-7 ${popular ? "border-fuchsia-300/70 bg-gradient-to-b from-fuchsia-500/20 via-[#1a1332] to-[#0a0f1f] shadow-[0_25px_80px_rgba(217,70,239,0.30)]" : "border-white/20 bg-white/[0.05]"}`}>
                  {popular ? <span className="absolute right-5 top-4 rounded-full bg-fuchsia-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]">Mais Popular</span> : null}
                  {highlighted ? <span className="mb-3 inline-flex rounded-full border border-cyan-300/60 bg-cyan-500/15 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100">Plano selecionado</span> : null}
                  <p className="text-xs uppercase tracking-[0.16em] text-cyan-100">Plano {plan.name}</p>
                  <h2 className="mt-1 text-3xl font-bold">{content.price}</h2>
                  {content.offer ? <p className="mt-1 text-sm font-medium text-emerald-300">Oferta: {content.offer}</p> : <p className="mt-1 text-sm text-zinc-300">Sem fidelidade</p>}
                  <p className="mt-3 text-sm text-zinc-200">{plan.description}</p>

                  <ul className="mt-6 space-y-2.5">
                    {content.features.map(([label, included]) => (
                      <li key={label} className="flex items-start gap-2 text-sm text-zinc-100">
                        <span className={`mt-[2px] inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${included ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>{included ? "✓" : "✕"}</span>
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>

                  <form action="/api/billing/checkout" method="post" className="mt-6">
                    <input type="hidden" name="plan_id" value={plan.id} />
                    <button className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${popular ? "bg-gradient-to-r from-cyan-300 to-fuchsia-300 text-slate-950 hover:opacity-90" : "border border-white/30 bg-white/10 hover:bg-white/20"}`}>{content.cta}</button>
                  </form>
                </article>
              );
            })}
          </div>

          {!user ? <p className="mt-4 text-center text-xs text-zinc-400">Ao assinar, você será redirecionado para login antes do checkout.</p> : null}
          <div className="mt-8 text-center">
            <Link href="/todos-os-kits" className="text-sm text-cyan-200 hover:text-cyan-100">Ou volte para explorar todos os kits</Link>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
