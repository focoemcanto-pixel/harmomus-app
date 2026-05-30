import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { CancelSubscriptionButton } from "./cancel-subscription-button";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import {
  getCustomerPaymentMethods,
  getStripeSubscription,
  listCustomerInvoices,
} from "@/lib/stripe/client";
import { getPlans } from "@/lib/data/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const EMPTY_VALUE = "-- --";

const STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  trialing: "Em período de teste",
  overdue: "Pagamento pendente",
  canceled: "Cancelada",
  expired: "Expirada",
  pending: "Pendente",
  past_due: "Pagamento em atraso",
  unpaid: "Não paga",
  incomplete: "Incompleta",
  incomplete_expired: "Expirada",
};

function formatDate(value?: string | null, fallback = "Não informado") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("pt-BR");
}

function formatAmount(cents?: number | null, currency?: string | null) {
  if (typeof cents !== "number") return "Não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: (currency ?? "BRL").toUpperCase(),
  }).format(cents / 100);
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

function billingCycleLabel(interval?: string | null, fallback = "Não informado") {
  if (interval === "year") return "Anual";
  if (interval === "month") return "Mensal";
  if (interval === "week") return "Semanal";
  if (interval === "day") return "Diário";
  return fallback;
}

function stripeTimestampToIso(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function getStripeSubscriptionPeriodEnd(subscription: any) {
  return stripeTimestampToIso(subscription?.current_period_end)
    ?? stripeTimestampToIso(subscription?.items?.data?.[0]?.current_period_end)
    ?? stripeTimestampToIso(subscription?.latest_invoice?.period_end)
    ?? null;
}

function getStripeSubscriptionTrialEnd(subscription: any) {
  return stripeTimestampToIso(subscription?.trial_end)
    ?? stripeTimestampToIso(subscription?.items?.data?.[0]?.trial_end)
    ?? null;
}

function getStripeId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id?: unknown }).id ?? "") || null;
  return null;
}

function getInvoiceSubscriptionId(invoice: any) {
  return getStripeId(invoice.subscription) ?? getStripeId(invoice.parent?.subscription_details?.subscription) ?? null;
}

function normalizeInvoices(invoices: any[], currentSubscriptionId?: string | null) {
  const seen = new Set<string>();
  return invoices
    .filter((invoice) => {
      const invoiceSubscriptionId = getInvoiceSubscriptionId(invoice);
      if (currentSubscriptionId && invoiceSubscriptionId && invoiceSubscriptionId !== currentSubscriptionId) return false;
      return true;
    })
    .filter((invoice) => {
      const total = Number(invoice.total ?? invoice.amount_paid ?? 0);
      const isZeroTrialInvoice = total === 0 && String(invoice.billing_reason ?? "").includes("subscription_create");
      if (isZeroTrialInvoice && seen.has("trial-zero-invoice")) return false;
      const key = isZeroTrialInvoice
        ? "trial-zero-invoice"
        : String(invoice.id ?? invoice.number ?? `${invoice.created}-${invoice.total}-${invoice.status}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function getInvoiceUrl(invoice: any) {
  return invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null;
}

function ministryPlanLabel(planType?: string | null) {
  const normalized = String(planType ?? "").toLowerCase();
  if (normalized === "ministry_40") return "Ministerial 40";
  if (normalized === "ministry_20") return "Ministerial 20";
  if (normalized === "ministry_10") return "Ministerial 10";
  return "Premium Ministerial";
}

function InfoCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-2 text-xs text-zinc-400">{hint}</p> : null}
    </div>
  );
}

async function getMinistryBillingInfo(context: Awaited<ReturnType<typeof getCurrentUserAccessContext>>) {
  if (!context.ministry?.ministryId) return null;
  const admin = createSupabaseAdminClient() as any;
  const [{ data: ministry }, { data: members }] = await Promise.all([
    admin.from("ministries").select("id,name,status,plan_type,seat_limit").eq("id", context.ministry.ministryId).maybeSingle(),
    admin.from("ministry_members").select("id,status").eq("ministry_id", context.ministry.ministryId),
  ]);

  const activeStatuses = new Set(["active", "pending", "invited"]);
  const usedSeats = (members ?? []).filter((member: any) => activeStatuses.has(String(member.status ?? ""))).length;
  const archivedCount = (members ?? []).filter((member: any) => String(member.status ?? "") === "removed").length;
  const seatLimit = Number(ministry?.seat_limit ?? context.ministry.seatLimit ?? 0);

  return {
    ministryName: ministry?.name || "seu ministério",
    ministryStatus: String(ministry?.status ?? "active"),
    planType: String(ministry?.plan_type ?? context.ministry.planType ?? ""),
    seatLimit,
    usedSeats,
    remainingSeats: Math.max(0, seatLimit - usedSeats),
    archivedCount,
  };
}

export default async function AssinaturaPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const [context, params] = await Promise.all([getCurrentUserAccessContext(), searchParams]);
  if (context.isGuest) redirect("/login");

  const isMinistryPremium = Boolean(context.ministry);
  const ministryInfo = isMinistryPremium ? await getMinistryBillingInfo(context) : null;
  const ministryRole = String(context.ministry?.role ?? "").toLowerCase();
  const canManageMinistry = ministryRole === "owner" || ministryRole === "manager" || ministryRole === "admin";

  if (isMinistryPremium) {
    const title = canManageMinistry ? ministryPlanLabel(ministryInfo?.planType) : "Premium Ministerial";
    return (
      <PublicAppShell>
        <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#060b1a] to-[#09031a] p-4 text-white md:p-8">
          <section className="mx-auto max-w-5xl rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#0a0f1f] p-6 shadow-[0_30px_80px_rgba(34,211,238,0.22)] md:p-10">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Painel de assinatura</p>
            <h1 className="mt-3 text-3xl font-semibold md:text-4xl">{canManageMinistry ? "Plano Ministerial" : "Minha conta"}</h1>

            <div className="mt-8 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">{canManageMinistry ? "Gestão do plano" : "Premium Ministerial"}</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-cyan-50">
                {canManageMinistry
                  ? `Você administra o acesso Premium Ministerial de ${ministryInfo?.ministryName ?? "seu ministério"}.`
                  : `Seu acesso Premium é fornecido por ${ministryInfo?.ministryName ?? "seu ministério"}.`}
              </p>
            </div>

            {canManageMinistry ? (
              <div className="mt-8 grid gap-4 md:grid-cols-4">
                <InfoCard label="Plano atual" value={title} />
                <InfoCard label="Status do plano" value={STATUS_LABELS[ministryInfo?.ministryStatus ?? "active"] ?? "Ativo"} />
                <InfoCard label="Vagas usadas" value={`${ministryInfo?.usedSeats ?? 0}/${ministryInfo?.seatLimit ?? context.ministry?.seatLimit ?? 0}`} hint={`${ministryInfo?.remainingSeats ?? 0} livres`} />
                <InfoCard label="Arquivados" value={String(ministryInfo?.archivedCount ?? 0)} hint="Histórico preservado" />
              </div>
            ) : (
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <InfoCard label="Plano atual" value="Premium Ministerial" />
                <InfoCard label="Status do acesso" value="Ativo" hint="Enquanto você fizer parte do ministério" />
                <InfoCard label="Ministério" value={ministryInfo?.ministryName ?? "Ministério"} />
              </div>
            )}

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-zinc-300">
              {canManageMinistry ? (
                <p>A cobrança e as vagas deste plano são gerenciadas pelo responsável ministerial. Use a Central Ministerial para convidar, remover, arquivar ou restaurar integrantes.</p>
              ) : (
                <p>Você não possui uma cobrança individual vinculada a este acesso. A gestão do plano, das vagas e dos convites é feita pelo responsável do ministério.</p>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/" className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">Ver site</a>
              <a href="/todos-os-kits" className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-100 hover:bg-white/10">Ver kits</a>
              {canManageMinistry ? (
                <a href="/ministerio" className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-100">Gerenciar ministério</a>
              ) : (
                <a href="/assinar?plan=premium" className="rounded-xl border border-fuchsia-300/40 bg-fuchsia-500/10 px-5 py-3 text-sm font-semibold text-fuchsia-100">Assinar Premium individual</a>
              )}
            </div>
          </section>
        </main>
      </PublicAppShell>
    );
  }

  const plans = await getPlans();
  const currentPlan = context.plan?.name ?? (context.effectiveSlug === "premium" ? "Premium" : context.effectiveSlug === "plus" ? "Plus" : "Free");
  const currentPlanSlug = String(context.plan?.slug ?? context.effectiveSlug ?? "free").toLowerCase();
  const isFreePlan = currentPlanSlug === "free";
  const status = String(context.subscription?.status ?? (isFreePlan ? "active" : "pending")).toLowerCase();
  const customerId = context.subscription?.stripe_customer_id ?? context.subscription?.gateway_customer_id;
  const subscriptionId = context.subscription?.stripe_subscription_id;
  const cancelAtPeriodEnd = Boolean((context.subscription as any)?.cancel_at_period_end);
  const hasStripeLink = Boolean(customerId && subscriptionId);
  const hasUnsyncedPremium = context.plan?.slug === "premium" && (status === "pending" || !hasStripeLink);

  let invoices: any[] = [];
  let paymentMethodLabel = isFreePlan ? EMPTY_VALUE : customerId ? "Não cadastrado" : "Não vinculado";
  let billingCycle = isFreePlan ? EMPTY_VALUE : "Não informado";
  let nextBillingDate: string | null = isFreePlan ? null : context.subscription?.next_billing_at ?? context.subscription?.current_period_end ?? null;
  let periodEndDate: string | null = isFreePlan ? null : context.subscription?.current_period_end ?? null;
  let trialEndDate: string | null = isFreePlan ? null : context.subscription?.trial_ends_at ?? null;

  if (!isFreePlan && customerId && process.env.STRIPE_SECRET_KEY) {
    const [invoiceResponse, paymentMethodsResponse, stripeSubscription] = await Promise.all([
      listCustomerInvoices(customerId, 24).catch(() => ({ data: [] })),
      getCustomerPaymentMethods(customerId, 1).catch(() => ({ data: [] })),
      subscriptionId ? getStripeSubscription(subscriptionId).catch(() => null) : Promise.resolve(null),
    ]);

    invoices = normalizeInvoices(Array.isArray(invoiceResponse?.data) ? invoiceResponse.data : [], subscriptionId);
    const card = paymentMethodsResponse?.data?.[0]?.card;
    paymentMethodLabel = card ? `${String(card.brand ?? "Cartão").toUpperCase()} •••• ${card.last4}` : "Não cadastrado";
    const interval = stripeSubscription?.items?.data?.[0]?.price?.recurring?.interval;
    billingCycle = billingCycleLabel(interval);
    const currentPeriodEndIso = getStripeSubscriptionPeriodEnd(stripeSubscription);
    const trialEndIso = getStripeSubscriptionTrialEnd(stripeSubscription);
    if (currentPeriodEndIso) {
      nextBillingDate = currentPeriodEndIso;
      periodEndDate = currentPeriodEndIso;
    }
    if (trialEndIso) {
      trialEndDate = trialEndIso;
      if (status === "trialing") {
        nextBillingDate = trialEndIso;
        periodEndDate = trialEndIso;
      }
    }
  }

  const renewalStatus = isFreePlan
    ? EMPTY_VALUE
    : cancelAtPeriodEnd
      ? `Cancelamento agendado para ${formatDate(periodEndDate)}`
      : ["active", "trialing"].includes(status)
        ? "Renovação automática ativa"
        : "Renovação não confirmada";

  const nextBillingLabel = isFreePlan
    ? EMPTY_VALUE
    : cancelAtPeriodEnd
      ? "Não renova"
      : status === "trialing"
        ? `Após teste: ${formatDate(trialEndDate ?? nextBillingDate)}`
        : formatDate(nextBillingDate, EMPTY_VALUE);

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#060b1a] to-[#09031a] p-4 text-white md:p-8">
        <section className="mx-auto max-w-5xl rounded-[2rem] border border-fuchsia-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#0a0f1f] p-6 shadow-[0_30px_80px_rgba(91,33,182,0.35)] md:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Painel de assinatura</p>
          <h1 className="mt-3 text-3xl font-semibold md:text-4xl">Status real da sua assinatura</h1>

          {hasUnsyncedPremium ? (
            <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">Sua assinatura ainda não foi sincronizada com o Stripe. Aguarde alguns instantes ou entre em contato.</div>
          ) : null}

          {cancelAtPeriodEnd ? (
            <div className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">Sua assinatura está programada para cancelar no fim do ciclo atual. Você continuará com acesso até {formatDate(periodEndDate)}.</div>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <InfoCard label="Plano atual" value={currentPlan} />
            <InfoCard label="Status da assinatura" value={STATUS_LABELS[status] ?? status} />
            <InfoCard label="Próxima cobrança" value={nextBillingLabel} />
            <InfoCard label="Método de pagamento" value={paymentMethodLabel} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <InfoCard label="Ciclo" value={billingCycle} />
            <InfoCard label="Renovação" value={renewalStatus} />
            <InfoCard label="Fim do teste" value={status === "trialing" ? formatDate(trialEndDate, EMPTY_VALUE) : "—"} />
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
                      <th className="px-3 py-3">Data</th>
                      <th className="px-3 py-3">Valor</th>
                      <th className="px-3 py-3">Plano</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Forma de pagamento</th>
                      <th className="px-3 py-3">Próxima cobrança</th>
                      <th className="px-3 py-3">Ciclo</th>
                      <th className="px-3 py-3">Recibo/Fatura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 text-zinc-100">
                    {invoices.map((invoice) => {
                      const invoiceUrl = getInvoiceUrl(invoice);
                      return (
                        <tr key={invoice.id}>
                          <td className="px-3 py-3">{formatDate(stripeTimestampToIso(invoice.created))}</td>
                          <td className="px-3 py-3">{formatAmount(invoice.amount_paid ?? invoice.total, invoice.currency)}</td>
                          <td className="px-3 py-3">{currentPlan}</td>
                          <td className="px-3 py-3">{invoiceStatusLabel(invoice.status)}</td>
                          <td className="px-3 py-3">{paymentMethodLabel}</td>
                          <td className="px-3 py-3">{nextBillingLabel}</td>
                          <td className="px-3 py-3">{billingCycle}</td>
                          <td className="px-3 py-3">
                            {invoiceUrl ? (
                              <a className="rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10" href={invoiceUrl} target="_blank" rel="noreferrer">Abrir fatura</a>
                            ) : (
                              <span className="text-zinc-500">Indisponível</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Gerenciar assinatura</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action="/api/billing/portal" method="post">
                <button className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-semibold text-slate-900">Abrir portal Stripe</button>
              </form>
              <a href="/assinar?plan=premium" className="rounded-xl border border-fuchsia-300/50 bg-fuchsia-500/10 px-5 py-3 text-sm font-semibold text-fuchsia-100">Trocar plano</a>
              {!cancelAtPeriodEnd && hasStripeLink ? (
                <form action="/api/billing/cancel" method="post"><CancelSubscriptionButton /></form>
              ) : null}
            </div>
            {!hasStripeLink ? (
              <p className="mt-3 text-xs text-zinc-400">Cancelamento direto indisponível porque esta assinatura não está vinculada ao Stripe neste cadastro.</p>
            ) : null}
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
