import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getCustomerPaymentMethods, getStripeSubscription, listCustomerInvoices } from "@/lib/stripe/client";
import { getPlans } from "@/lib/data/plans";

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  trialing: "Em período de teste",
  overdue: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Expirada",
  pending: "Pendente",
};

function formatDate(value?: string | null) {
  if (!value) return "Não informado";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatAmount(cents?: number | null, currency?: string | null) {
  if (typeof cents !== "number") return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: (currency ?? "BRL").toUpperCase() }).format(cents / 100);
}

function invoiceStatusLabel(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "paid") return "Pago";
  if (normalized === "open") return "Em aberto";
  if (normalized === "void") return "Cancelado";
  if (normalized === "uncollectible") return "Não cobrável";
  if (normalized === "draft") return "Rascunho";
  return status || "—";
}

export default async function AssinaturaPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const [context, params] = await Promise.all([getCurrentUserAccessContext(), searchParams]);
  if (context.isGuest) redirect("/login");

  const plans = await getPlans();
  const currentPlan = context.plan?.name ?? "Free";
  const status = context.subscription?.status ?? "pending";
  const customerId = context.subscription?.stripe_customer_id ?? context.subscription?.gateway_customer_id;
  const subscriptionId = context.subscription?.stripe_subscription_id;

  let invoices: any[] = [];
  let paymentMethodLabel = "Não informado";
  let billingCycle = "Não informado";
  if (customerId && process.env.STRIPE_SECRET_KEY) {
    const [invoiceResponse, paymentMethodsResponse, stripeSubscription] = await Promise.all([
      listCustomerInvoices(customerId, 12).catch(() => ({ data: [] })),
      getCustomerPaymentMethods(customerId, 1).catch(() => ({ data: [] })),
      subscriptionId ? getStripeSubscription(subscriptionId).catch(() => null) : Promise.resolve(null),
    ]);
    invoices = Array.isArray(invoiceResponse?.data) ? invoiceResponse.data : [];
    const card = paymentMethodsResponse?.data?.[0]?.card;
    paymentMethodLabel = card ? `${String(card.brand ?? "Cartão").toUpperCase()} •••• ${card.last4}` : "Não cadastrado";
    const interval = stripeSubscription?.items?.data?.[0]?.price?.recurring?.interval;
    billingCycle = interval === "year" ? "Anual" : interval === "month" ? "Mensal" : "Não informado";
  }

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#060b1a] to-[#09031a] p-4 text-white md:p-8">
        <section className="mx-auto max-w-5xl rounded-[2rem] border border-fuchsia-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#0a0f1f] p-6 shadow-[0_30px_80px_rgba(91,33,182,0.35)] md:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Painel de assinatura</p>
          <h1 className="mt-3 text-3xl font-semibold md:text-4xl">Status real da sua assinatura</h1>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Plano atual</p><p className="mt-2 text-2xl font-semibold">{currentPlan}</p></div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Status da assinatura</p><p className="mt-2 text-xl font-semibold text-emerald-300">{STATUS_LABELS[status] ?? status}</p></div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Próxima cobrança</p><p className="mt-2 text-xl font-semibold">{formatDate(context.subscription?.next_billing_at)}</p></div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Método de pagamento</p><p className="mt-2 text-xl font-semibold">{paymentMethodLabel}</p></div>
          </div>

          {params?.error ? <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{params.error}</p> : null}

          <div className="mt-8 rounded-2xl border border-white/15 bg-black/20 p-5">
            <h2 className="text-lg font-semibold">Histórico de pagamentos</h2>
            {!invoices.length ? (
              <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-zinc-300">Quando houver cobranças, seus recibos e faturas aparecerão aqui.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.1em] text-zinc-400">
                    <tr>
                      <th className="px-3 py-3">Data</th><th className="px-3 py-3">Valor</th><th className="px-3 py-3">Plano</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Forma de pagamento</th><th className="px-3 py-3">Próxima cobrança</th><th className="px-3 py-3">Ciclo</th><th className="px-3 py-3">Recibo/Fatura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-zinc-100">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="px-3 py-3">{formatDate(invoice.created ? new Date(invoice.created * 1000).toISOString() : null)}</td>
                        <td className="px-3 py-3">{formatAmount(invoice.amount_paid ?? invoice.total, invoice.currency)}</td>
                        <td className="px-3 py-3">{currentPlan}</td>
                        <td className="px-3 py-3">{invoiceStatusLabel(invoice.status)}</td>
                        <td className="px-3 py-3">{paymentMethodLabel}</td>
                        <td className="px-3 py-3">{formatDate(context.subscription?.next_billing_at)}</td>
                        <td className="px-3 py-3">{billingCycle}</td>
                        <td className="px-3 py-3">{invoice.invoice_pdf ? <a className="rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10" href={invoice.invoice_pdf} target="_blank">Baixar recibo</a> : <span className="text-zinc-500">Indisponível</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Gerenciar assinatura</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action="/api/billing/portal" method="post"><button className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-semibold text-slate-900">Abrir portal Stripe</button></form>
              <a href="/assinar?plan=premium" className="rounded-xl border border-fuchsia-300/50 bg-fuchsia-500/10 px-5 py-3 text-sm font-semibold text-fuchsia-100">Trocar plano</a>
              <form action="/api/billing/cancel" method="post"><button className="rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200">Cancelar assinatura</button></form>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Planos disponíveis</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {plans.filter((p) => ["plus", "premium"].includes(p.slug)).map((plan) => (
                <div key={plan.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="text-sm font-semibold">{plan.name}</p><p className="text-xs text-zinc-300">{plan.description}</p></div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
