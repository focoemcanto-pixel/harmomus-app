import { Activity, BadgeCheck, CreditCard, ReceiptText, RefreshCw, WalletCards } from "lucide-react";

import { BillingMobileActivityList } from "@/components/admin/billing-mobile-activity-list";
import { PageHeader } from "@/components/admin/page-header";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SubscriptionItem = {
  id: string;
  plan_id: string | null;
  gateway: string | null;
  status: string | null;
  created_at: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  profiles?: { full_name?: string | null; email?: string | null; role?: string | null } | null;
};

type PlanItem = {
  id: string;
  slug: string | null;
  name: string | null;
  price_cents: number | null;
};

type InvoiceItem = {
  id: string;
  amount_paid_cents?: number | null;
  paid_at?: string | null;
  created_at?: string | null;
  status?: string | null;
  customer_email?: string | null;
  profiles?: { email?: string | null; role?: string | null } | null;
  plans?: { name?: string | null } | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isOwner(profile?: { role?: string | null } | null) {
  return normalize(profile?.role) === "owner";
}

function isActive(status?: string | null) {
  return ["active", "trialing"].includes(normalize(status));
}

function statusLabel(status?: string | null) {
  const value = normalize(status);
  if (value === "active") return "Ativo";
  if (value === "trialing") return "Teste";
  if (value === "overdue") return "Atrasado";
  if (value === "canceled") return "Cancelado";
  if (value === "expired") return "Expirado";
  return "Pendente";
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function count(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function date(value?: string | null) {
  return formatDateTimeBR(value).replace("-", "—");
}

function sumPaid(invoices: InvoiceItem[], after?: Date) {
  return invoices.reduce((total, invoice) => {
    if (normalize(invoice.status) !== "paid") return total;
    if (after && (!invoice.paid_at || new Date(invoice.paid_at) < after)) return total;
    return total + Number(invoice.amount_paid_cents ?? 0);
  }, 0);
}

function StatCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: any }) {
  return (
    <article className="min-w-[210px] rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
        <Icon className="h-4 w-4 text-gold-300" />
      </div>
      <p className="text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </article>
  );
}

export default async function BillingPage() {
  const supabase = createSupabaseAdminClient() as any;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [subscriptionsResult, plansResult, invoicesResult, failedEventsResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id,plan_id,gateway,status,created_at,current_period_end,trial_ends_at,profiles(full_name,email,role)")
      .order("created_at", { ascending: false }),
    supabase.from("plans").select("id,slug,name,price_cents"),
    supabase
      .from("billing_invoices")
      .select("id,amount_paid_cents,paid_at,created_at,status,customer_email,profiles(email,role),plans(name)")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(500),
    supabase.from("billing_events").select("id", { count: "exact", head: true }).eq("processed", false),
  ]);

  const subscriptions = ((subscriptionsResult.data ?? []) as SubscriptionItem[]).filter((item) => !isOwner(item.profiles));
  const plans = (plansResult.data ?? []) as PlanItem[];
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const invoices = invoicesResult.error ? [] : ((invoicesResult.data ?? []) as InvoiceItem[]).filter((item) => !isOwner(item.profiles));
  const paidInvoices = invoices.filter((invoice) => normalize(invoice.status) === "paid" && Number(invoice.amount_paid_cents ?? 0) > 0);

  const activeSubscriptions = subscriptions.filter((item) => isActive(item.status));
  const paidActiveSubscriptions = activeSubscriptions.filter((item) => {
    const plan = planById.get(String(item.plan_id));
    return normalize(plan?.slug) !== "free" && Number(plan?.price_cents ?? 0) > 0;
  });
  const mrr = paidActiveSubscriptions.reduce((total, item) => total + Number(planById.get(String(item.plan_id))?.price_cents ?? 0), 0);
  const pendingCount = subscriptions.filter((item) => normalize(item.status) === "pending").length;
  const overdueCount = subscriptions.filter((item) => normalize(item.status) === "overdue").length;
  const trialingCount = subscriptions.filter((item) => normalize(item.status) === "trialing").length;
  const failedEventsCount = failedEventsResult.error ? 0 : (failedEventsResult.count ?? 0);

  const revenue30d = sumPaid(paidInvoices, thirtyDaysAgo);
  const revenueYear = sumPaid(paidInvoices, yearStart);
  const revenueTotal = sumPaid(paidInvoices);
  const latestPayments = paidInvoices.slice(0, 8);

  const activity = subscriptions.slice(0, 12).map((item) => {
    const plan = planById.get(String(item.plan_id));
    return {
      user: item.profiles?.full_name ?? item.profiles?.email ?? "Usuário sem nome",
      email: item.profiles?.email ?? "—",
      plan: plan?.name ?? plan?.slug ?? "Plano desconhecido",
      gateway: item.gateway ?? "—",
      status: statusLabel(item.status),
      createdAt: item.created_at,
      currentPeriodEnd: item.current_period_end ?? item.trial_ends_at ?? null,
    };
  });

  return (
    <section className="space-y-4 sm:space-y-6">
      <PageHeader title="Billing" description="Cockpit financeiro mobile-first para receita, assinaturas, cobranças e atividade recente." />

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-2 md:px-0 xl:grid-cols-4">
        <StatCard label="Receita 30 dias" value={money(revenue30d)} detail={`${count(paidInvoices.length)} pagamento(s) salvos`} icon={ReceiptText} />
        <StatCard label="Receita no ano" value={money(revenueYear)} detail={`Histórico: ${money(revenueTotal)}`} icon={CreditCard} />
        <StatCard label="MRR estimado" value={money(mrr)} detail={`${count(paidActiveSubscriptions.length)} pagantes ativos`} icon={WalletCards} />
        <StatCard label="Pendências" value={count(pendingCount + overdueCount + failedEventsCount)} detail={`${pendingCount} pending • ${overdueCount} overdue • ${failedEventsCount} eventos`} icon={Activity} />
      </div>

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
        <div className="min-w-[150px] rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium"><p className="text-xs uppercase tracking-wide text-muted">Em teste</p><p className="mt-2 text-2xl font-semibold text-white">{count(trialingCount)}</p></div>
        <div className="min-w-[150px] rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium"><p className="text-xs uppercase tracking-wide text-muted">Atrasadas</p><p className="mt-2 text-2xl font-semibold text-white">{count(overdueCount)}</p></div>
        <div className="min-w-[150px] rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium"><p className="text-xs uppercase tracking-wide text-muted">Pendentes</p><p className="mt-2 text-2xl font-semibold text-white">{count(pendingCount)}</p></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium sm:p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white"><ReceiptText className="h-4 w-4 text-emerald-300" /> Últimos pagamentos</h2>
          <div className="space-y-3">
            {latestPayments.map((invoice) => (
              <div key={invoice.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-medium text-white">{invoice.customer_email ?? invoice.profiles?.email ?? "Cliente sem e-mail"}</p><p className="text-xs text-muted">{invoice.plans?.name ?? "Plano não identificado"} • {date(invoice.paid_at ?? invoice.created_at)}</p></div>
                  <span className="shrink-0 font-semibold text-emerald-300">{money(Number(invoice.amount_paid_cents ?? 0))}</span>
                </div>
              </div>
            ))}
            {latestPayments.length === 0 ? <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">Nenhum pagamento real salvo ainda.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium sm:p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white"><Activity className="h-4 w-4 text-violet-300" /> Migração e atividade recente</h2>
          <BillingMobileActivityList items={activity} />
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr className="border-b border-white/10"><th className="px-3 py-2 font-medium">Usuário</th><th className="px-3 py-2 font-medium">E-mail</th><th className="px-3 py-2 font-medium">Plano</th><th className="px-3 py-2 font-medium">Gateway</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Renova/expira</th></tr></thead>
              <tbody>{activity.map((item, index) => <tr key={`${item.email}-${index}`} className="border-b border-white/5 last:border-none"><td className="px-3 py-3 text-white">{item.user}</td><td className="px-3 py-3 text-muted">{item.email}</td><td className="px-3 py-3 text-muted">{item.plan}</td><td className="px-3 py-3 text-muted">{item.gateway}</td><td className="px-3 py-3"><span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs font-medium text-zinc-200">{item.status === "Ativo" ? <BadgeCheck className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}{item.status}</span></td><td className="px-3 py-3 text-muted">{date(item.currentPeriodEnd)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
