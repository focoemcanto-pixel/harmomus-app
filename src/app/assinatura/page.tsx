import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { CancelSubscriptionButton } from "./cancel-subscription-button";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import {
  getCustomerPaymentMethods,
  getStripeSubscription,
  listCustomerInvoices,
} from "@/lib/stripe/client";
import { listSubscriptionPayments } from "@/lib/asaas/subscriptions";
import { getBillingRecoveryNotice, type BillingRecoveryNotice } from "@/lib/data/billing-recovery-notices";
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

const PAYMENT_ISSUE_STATUSES = new Set(["canceled", "past_due", "unpaid", "overdue", "incomplete", "incomplete_expired"]);

const RECOVERY_REASON_LABELS: Record<string, string> = {
  payment_failed: "Pagamento não confirmado",
  invoice_overdue: "Cobrança vencida",
  subscription_canceled: "Assinatura cancelada",
  subscription_unpaid: "Assinatura não paga",
  subscription_past_due: "Pagamento em atraso",
  payment_issue_dismissed: "Aviso dispensado anteriormente",
};

function recoveryReasonLabel(reason?: string | null, status?: string | null) {
  const normalizedReason = String(reason ?? "").trim().toLowerCase();
  if (normalizedReason) return RECOVERY_REASON_LABELS[normalizedReason] ?? reason ?? "Não informado";

  const normalizedStatus = String(status ?? "").trim().toLowerCase();
  if (normalizedStatus === "past_due") return "Pagamento em atraso";
  if (normalizedStatus === "unpaid") return "Assinatura não paga";
  if (normalizedStatus === "overdue") return "Cobrança vencida";
  if (normalizedStatus === "canceled") return "Assinatura cancelada";
  if (normalizedStatus === "incomplete" || normalizedStatus === "incomplete_expired") return "Pagamento não concluído";

  return "Não informado";
}

function shouldShowRecoveryBlock(input: { isEligible: boolean; notice: BillingRecoveryNotice | null; status: string }) {
  if (!input.isEligible) return false;
  if (input.notice) return !input.notice.dismissed_at;
  return PAYMENT_ISSUE_STATUSES.has(input.status);
}

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
  if (normalized === "received" || normalized === "confirmed") return "Pago";
  if (normalized === "pending") return "Pendente";
  if (normalized === "overdue") return "Vencido";
  if (normalized === "deleted" || normalized === "cancelled" || normalized === "canceled") return "Cancelado";
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
  return invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? invoice.invoiceUrl ?? invoice.bankSlipUrl ?? invoice.transactionReceiptUrl ?? null;
}

function asaasTimestampToIso(invoice: any) {
  const value = invoice.created ?? invoice.dueDate ?? invoice.paymentDate ?? invoice.clientPaymentDate;
  if (typeof value === "number") return stripeTimestampToIso(value);
  if (typeof value !== "string") return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatInvoiceDate(invoice: any, gateway: string) {
  return gateway === "asaas" ? formatDate(asaasTimestampToIso(invoice)) : formatDate(stripeTimestampToIso(invoice.created));
}

function formatInvoiceAmount(invoice: any, gateway: string) {
  if (gateway === "asaas") {
    const value = typeof invoice.value === "number" ? invoice.value : null;
    return value === null ? "Não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  return formatAmount(invoice.amount_paid ?? invoice.total, invoice.currency);
}

function ministryPlanLabel(planType?: string | null) {
  const normalized = String(planType ?? "").toLowerCase();
  if (normalized === "ministry_40") return "Ministerial 40";
  if (normalized === "ministry_20") return "Ministerial 20";
  if (normalized === "ministry_10") return "Ministerial 10";
  return "Premium Ministerial";
}

function effectivePlanLabel(effectiveSlug: string, subscriptionPlanName?: string | null) {
  if (effectiveSlug === "premium") return subscriptionPlanName ?? "Premium";
  if (effectiveSlug === "plus") return subscriptionPlanName ?? "Plus";
  return "Free";
}

function effectivePlanSlug(effectiveSlug: string) {
  if (effectiveSlug === "premium" || effectiveSlug === "plus") return effectiveSlug;
  return "free";
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

export default async function AssinaturaPage({ searchParams }: { searchParams?: Promise<{ error?: string; message?: string }> }) {
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
              <p className="mt-3 text-sm leading-6 text-cyan-50">{canManageMinistry ? `Você administra o acesso Premium Ministerial de ${ministryInfo?.ministryName ?? "seu ministério"}.` : `Seu acesso Premium é fornecido por ${ministryInfo?.ministryName ?? "seu ministério"}.`}</p>
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
          </section>
        </main>
      </PublicAppShell>
    );
  }

  const currentPlan = effectivePlanLabel(context.effectiveSlug, context.plan?.name);
  const currentPlanSlug = effectivePlanSlug(context.effectiveSlug);
  const isFreePlan = currentPlanSlug === "free";
  const status = String(context.subscription?.status ?? (isFreePlan ? "active" : "pending")).toLowerCase();
  const gateway = String(context.subscription?.gateway ?? "stripe").toLowerCase();
  const isAsaas = gateway === "asaas";
  const isStripe = !isAsaas;
  const customerId = isStripe ? context.subscription?.stripe_customer_id ?? context.subscription?.gateway_customer_id : context.subscription?.gateway_customer_id;
  const subscriptionId = isStripe ? context.subscription?.stripe_subscription_id : context.subscription?.gateway_subscription_id;
  const cancelAtPeriodEnd = Boolean((context.subscription as any)?.cancel_at_period_end);
  const hasStripeLink = Boolean(isStripe && customerId && subscriptionId);
  const hasAsaasLink = Boolean(isAsaas && customerId && subscriptionId && !isFreePlan);
  const isBillingRecoveryEligible = Boolean(!context.isAdmin && !context.ministry && context.profile?.id);
  const billingRecoveryNotice = isBillingRecoveryEligible
    ? await getBillingRecoveryNotice(context.profile?.id)
    : null;
  const shouldShowPaymentIssueWarning = shouldShowRecoveryBlock({
    isEligible: isBillingRecoveryEligible,
    notice: billingRecoveryNotice,
    status,
  });
  const recoveryStatusLabel = context.subscription?.status ? STATUS_LABELS[status] ?? status : currentPlan;
  const recoveryReason = recoveryReasonLabel(billingRecoveryNotice?.reason, status);
  const recoveryLastPaymentDate = formatDate(billingRecoveryNotice?.last_payment_at, "Não informado");

  let invoices: any[] = [];
  let paymentMethodLabel = isFreePlan ? EMPTY_VALUE : customerId ? "Não cadastrado" : "Não vinculado";
  let billingCycle = isFreePlan ? EMPTY_VALUE : "Não informado";
  let nextBillingDate: string | null = isFreePlan ? null : context.subscription?.next_billing_at ?? context.subscription?.current_period_end ?? null;
  let periodEndDate: string | null = isFreePlan ? null : context.subscription?.current_period_end ?? null;
  let trialEndDate: string | null = isFreePlan ? null : context.subscription?.trial_ends_at ?? null;

  if (!isFreePlan && isStripe && customerId && process.env.STRIPE_SECRET_KEY) {
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

  if (!isFreePlan && isAsaas && subscriptionId && process.env.ASAAS_API_KEY) {
    const asaasPayments = await listSubscriptionPayments(subscriptionId, 12).catch(() => []);
    invoices = asaasPayments.slice(0, 6);
    paymentMethodLabel = asaasPayments[0]?.billingType === "PIX" ? "Pix" : asaasPayments[0]?.billingType === "BOLETO" ? "Boleto" : "Asaas";
    billingCycle = "Mensal";
  } else if (!isFreePlan && isAsaas) {
    paymentMethodLabel = "Asaas";
    billingCycle = "Mensal";
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
          {params?.message ? <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{params.message}</p> : null}
          {params?.error ? <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{params.error}</p> : null}
          {shouldShowPaymentIssueWarning ? (
            <div className="mt-6 rounded-2xl border border-amber-300/40 bg-amber-500/10 p-5 shadow-[0_20px_60px_rgba(245,158,11,0.16)]">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200">Pagamento não confirmado</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Seu pagamento não foi confirmado</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-50">Seu acesso Premium foi pausado temporariamente.</p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <InfoCard label="Última data paga" value={recoveryLastPaymentDate} />
                <InfoCard label="Motivo" value={recoveryReason} />
                <InfoCard label="Status atual" value={recoveryStatusLabel} />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                {isStripe && customerId ? (
                  <form action="/api/billing/portal" method="post">
                    <button className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-semibold text-slate-900">Abrir portal Stripe</button>
                  </form>
                ) : (
                  <a href="/assinar?plano=premium" className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-semibold text-slate-900">Assinar Premium</a>
                )}
                <a href="/api/billing/recovery-notice/dismiss" className="rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">Continuar no plano gratuito</a>
              </div>
            </div>
          ) : null}
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <InfoCard label="Plano atual" value={currentPlan} />
            <InfoCard label="Status da assinatura" value={isFreePlan ? "Free" : STATUS_LABELS[status] ?? status} />
            <InfoCard label="Próxima cobrança" value={nextBillingLabel} />
            <InfoCard label="Método de pagamento" value={paymentMethodLabel} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <InfoCard label="Ciclo" value={billingCycle} />
            <InfoCard label="Renovação" value={renewalStatus} />
            <InfoCard label="Fim do teste" value={status === "trialing" ? formatDate(trialEndDate, EMPTY_VALUE) : "—"} />
          </div>
          <div className="mt-8 rounded-2xl border border-white/15 bg-black/20 p-5">
            <h2 className="text-lg font-semibold">Histórico de pagamentos</h2>
            {!invoices.length ? <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-zinc-300">Quando houver cobranças, seus recibos e faturas aparecerão aqui.</p> : (
              <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.1em] text-zinc-400"><tr><th className="px-3 py-3">Data</th><th className="px-3 py-3">Valor</th><th className="px-3 py-3">Plano</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Forma de pagamento</th><th className="px-3 py-3">Próxima cobrança</th><th className="px-3 py-3">Ciclo</th><th className="px-3 py-3">Recibo/Fatura</th></tr></thead><tbody className="divide-y divide-white/10 text-zinc-100">{invoices.map((invoice) => { const invoiceUrl = getInvoiceUrl(invoice); return <tr key={invoice.id}><td className="px-3 py-3">{formatInvoiceDate(invoice, gateway)}</td><td className="px-3 py-3">{formatInvoiceAmount(invoice, gateway)}</td><td className="px-3 py-3">{currentPlan}</td><td className="px-3 py-3">{invoiceStatusLabel(invoice.status)}</td><td className="px-3 py-3">{paymentMethodLabel}</td><td className="px-3 py-3">{nextBillingLabel}</td><td className="px-3 py-3">{billingCycle}</td><td className="px-3 py-3">{invoiceUrl ? <a className="rounded-lg border border-cyan-300/40 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10" href={invoiceUrl} target="_blank" rel="noreferrer">Abrir fatura</a> : <span className="text-zinc-500">Indisponível</span>}</td></tr>; })}</tbody></table></div>
            )}
          </div>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Gerenciar assinatura</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {isStripe && customerId ? <form action="/api/billing/portal" method="post"><button className="rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-semibold text-slate-900">Abrir portal Stripe</button></form> : null}
              {isAsaas && !isFreePlan && invoices[0] ? <a href={getInvoiceUrl(invoices[0]) ?? "#"} target="_blank" rel="noreferrer" className="rounded-xl border border-cyan-300/50 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100">Visualizar cobrança</a> : null}
              <a href="/assinar?plano=premium" className="rounded-xl border border-fuchsia-300/50 bg-fuchsia-500/10 px-5 py-3 text-sm font-semibold text-fuchsia-100">{isFreePlan && !customerId ? "Assinar Premium" : "Trocar plano"}</a>
              {!cancelAtPeriodEnd && (hasStripeLink || hasAsaasLink) ? <form action="/api/billing/cancel" method="post"><CancelSubscriptionButton /></form> : null}
            </div>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
