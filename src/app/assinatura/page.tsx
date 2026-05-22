import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getPlans } from "@/lib/data/plans";

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  trialing: "Em período de teste",
  overdue: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Expirada",
  pending: "Pendente",
};

export default async function AssinaturaPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const [context, params] = await Promise.all([getCurrentUserAccessContext(), searchParams]);
  if (context.isGuest) redirect("/login");

  const plans = await getPlans();
  const currentPlan = context.plan?.name ?? "Free";
  const status = context.subscription?.status ?? "pending";
  const nextBillingDate = context.subscription?.next_billing_at ? new Date(context.subscription.next_billing_at).toLocaleDateString("pt-BR") : "Sem data";

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#060b1a] to-[#09031a] p-4 text-white md:p-8">
        <section className="mx-auto max-w-5xl rounded-[2rem] border border-fuchsia-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#0a0f1f] p-6 shadow-[0_30px_80px_rgba(91,33,182,0.35)] md:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Painel de assinatura</p>
          <h1 className="mt-3 text-3xl font-semibold md:text-4xl">Sua conta premium Harmomus</h1>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Plano atual</p>
              <p className="mt-2 text-2xl font-semibold">{currentPlan}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Status</p>
              <p className="mt-2 text-xl font-semibold text-emerald-300">{STATUS_LABELS[status] ?? status}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Próxima cobrança</p>
              <p className="mt-2 text-xl font-semibold">{nextBillingDate}</p>
            </div>
          </div>

          {params?.error ? <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{params.error}</p> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <form action="/api/billing/portal" method="post">
              <button className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-semibold text-slate-900">Gerenciar assinatura</button>
            </form>
            <a href="/assinar?plan=premium" className="rounded-xl border border-fuchsia-300/50 bg-fuchsia-500/10 px-5 py-3 text-sm font-semibold text-fuchsia-100">Trocar plano</a>
          </div>

          <div className="mt-8 rounded-2xl border border-white/15 bg-black/20 p-5">
            <h2 className="text-lg font-semibold">Histórico e estado da assinatura</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-200">
              <li>• Gateway: {context.subscription?.gateway ?? "stripe"}</li>
              <li>• Status interno: {context.subscription?.status ?? "pending"}</li>
              <li>• Início da recorrência: {context.subscription?.starts_at ? new Date(context.subscription.starts_at).toLocaleDateString("pt-BR") : "não registrado"}</li>
              <li>• Fim da recorrência: {context.subscription?.current_period_end ? new Date(context.subscription.current_period_end).toLocaleDateString("pt-BR") : "não registrado"}</li>
            </ul>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Planos disponíveis</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {plans.filter((p) => ["plus", "premium"].includes(p.slug)).map((plan) => (
                <div key={plan.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold">{plan.name}</p>
                  <p className="text-xs text-zinc-300">{plan.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
