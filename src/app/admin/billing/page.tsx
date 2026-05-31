import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  ChartNoAxesCombined,
  CreditCard,
  Crown,
  ExternalLink,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

type PlanSummary = Pick<PlanRow, "id" | "slug" | "name" | "price_cents" | "features" | "status" | "hierarchy_level">;

type SubscriptionWithProfile = Pick<
  SubscriptionRow,
  | "id"
  | "user_id"
  | "plan_id"
  | "gateway"
  | "status"
  | "created_at"
  | "updated_at"
  | "current_period_end"
  | "trial_ends_at"
  | "canceled_at"
> & {
  profiles?: { full_name?: string | null; email?: string | null; role?: string | null } | null;
};

type BillingInvoiceRow = {
  id: string;
  amount_paid_cents?: number | null;
  amount_due_cents?: number | null;
  amount_remaining_cents?: number | null;
  paid_at?: string | null;
  created_at?: string | null;
  status?: string | null;
  plan_id?: string | null;
  customer_email?: string | null;
  hosted_invoice_url?: string | null;
  profiles?: { full_name?: string | null; email?: string | null; role?: string | null } | null;
  plans?: { name?: string | null; slug?: string | null } | null;
};

type RecentActivityItem = {
  user: string;
  email: string;
  plan: string;
  gateway: string;
  status: string;
  createdAt: string | null;
  currentPeriodEnd: string | null;
};

const FEATURE_LABELS: Record<string, string> = {
  biblioteca_basica: "Biblioteca básica",
  biblioteca_plus: "Biblioteca Plus",
  biblioteca_total: "Biblioteca completa",
  playlists: "Playlists",
  playlists_ilimitadas: "Playlists ilimitadas",
  troca_tons: "Troca de tons",
  solicitar_musicas: "Solicitar músicas",
  kits_premium: "Kits premium",
  suporte_prioritario: "Suporte prioritário",
  early_access: "Acesso antecipado",
  ministry: "Área ministerial",
  ministry_members: "Membros do ministério",
  ministry_repertoire: "Repertórios ministeriais",
};

const DEFAULT_FEATURES = [
  "biblioteca_basica",
  "biblioteca_plus",
  "biblioteca_total",
  "playlists_ilimitadas",
  "troca_tons",
  "solicitar_musicas",
  "kits_premium",
  "suporte_prioritario",
  "early_access",
  "ministry",
  "ministry_members",
  "ministry_repertoire",
];

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDateTime(value?: string | null) {
  return formatDateTimeBR(value).replace("-", "—");
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isOwnerProfile(profile?: { role?: string | null } | null) {
  return normalize(profile?.role) === "owner";
}

function isActiveStatus(status?: string | null) {
  return ["active", "trialing"].includes(normalize(status));
}

function isPaidPlan(plan?: PlanSummary | null) {
  const slug = normalize(plan?.slug);
  return slug !== "free" && Number(plan?.price_cents ?? 0) > 0;
}

function mapStatusLabel(status: SubscriptionRow["status"] | string | null | undefined) {
  const normalized = normalize(status);
  if (normalized === "active") return "Ativo";
  if (normalized === "trialing") return "Teste";
  if (normalized === "overdue") return "Atrasado";
  if (normalized === "canceled") return "Cancelado";
  if (normalized === "expired") return "Expirado";
  return "Pendente";
}

function readFeatures(plan: PlanSummary) {
  const raw = plan.features;
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function featureLabel(feature: string) {
  return FEATURE_LABELS[feature] ?? feature.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusBadgeClass(status: string) {
  if (status === "Ativo" || status === "Pago") return "bg-emerald-500/20 text-emerald-300";
  if (status === "Teste") return "bg-cyan-500/20 text-cyan-200";
  if (status === "Atrasado" || status === "Falhou") return "bg-amber-500/20 text-amber-200";
  return "bg-rose-500/20 text-rose-300";
}

function sumPaidInvoices(invoices: BillingInvoiceRow[], predicate: (invoice: BillingInvoiceRow) => boolean) {
  return invoices.reduce((total, invoice) => {
    if (!predicate(invoice)) return total;
    return total + Number(invoice.amount_paid_cents ?? 0);
  }, 0);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BillingPage() {
  const supabase = createSupabaseAdminClient() as any;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const yearStart = startOfYear(now);

  const [
    subscriptionsResult,
    plansResult,
    failedEventsResult,
    latestSyncResult,
    profilesCountResult,
    ownersCountResult,
    invoicesResult,
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id,user_id,plan_id,gateway,status,created_at,updated_at,current_period_end,trial_ends_at,canceled_at,profiles(full_name,email,role)")
      .order("created_at", { ascending: false }),
    supabase.from("plans").select("id,slug,name,price_cents,features,status,hierarchy_level").order("hierarchy_level", { ascending: true }),
    supabase.from("billing_events").select("id", { count: "exact", head: true }).eq("processed", false),
    supabase.from("billing_events").select("created_at").order("created_at", { ascending: false }).limit(1),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner"),
    supabase
      .from("billing_invoices")
      .select("id,amount_paid_cents,amount_due_cents,amount_remaining_cents,paid_at,created_at,status,plan_id,customer_email,hosted_invoice_url,profiles(full_name,email,role),plans(name,slug)")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(500),
  ]);

  const allSubscriptions = ((subscriptionsResult.data ?? []) as SubscriptionWithProfile[]).filter(
    (subscription) => !isOwnerProfile(subscription.profiles),
  );
  const plans = ((plansResult.data ?? []) as PlanSummary[]).filter((plan) => normalize(plan.status) !== "inactive");
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const allInvoices = invoicesResult.error
    ? []
    : ((invoicesResult.data ?? []) as BillingInvoiceRow[]).filter((invoice) => !isOwnerProfile(invoice.profiles));
  const paidInvoices = allInvoices.filter((invoice) => normalize(invoice.status) === "paid" && Number(invoice.amount_paid_cents ?? 0) > 0);
  const failedInvoices = allInvoices.filter((invoice) => ["open", "uncollectible", "void", "payment_failed"].includes(normalize(invoice.status)) && Number(invoice.amount_due_cents ?? 0) > 0);

  const ownerSubscriptionCount = ((subscriptionsResult.data ?? []) as SubscriptionWithProfile[]).filter((subscription) =>
    isOwnerProfile(subscription.profiles),
  ).length;
  const activeSubscriptions = allSubscriptions.filter((subscription) => isActiveStatus(subscription.status));
  const paidActiveSubscriptions = activeSubscriptions.filter((subscription) => isPaidPlan(planById.get(subscription.plan_id)));
  const trialingCount = allSubscriptions.filter((subscription) => normalize(subscription.status) === "trialing").length;
  const overdueCount = allSubscriptions.filter((subscription) => normalize(subscription.status) === "overdue").length;
  const canceledCount = allSubscriptions.filter((subscription) => normalize(subscription.status) === "canceled").length;
  const pendingCount = allSubscriptions.filter((subscription) => normalize(subscription.status) === "pending").length;

  const countByPlan = new Map<string, number>();
  const estimatedRevenueByPlan = new Map<string, number>();
  let estimatedMrrCents = 0;

  for (const subscription of activeSubscriptions) {
    const plan = planById.get(subscription.plan_id);
    const slug = normalize(plan?.slug) || "sem_plano";
    const planRevenue = isPaidPlan(plan) ? Number(plan?.price_cents ?? 0) : 0;
    countByPlan.set(slug, (countByPlan.get(slug) ?? 0) + 1);
    estimatedRevenueByPlan.set(slug, (estimatedRevenueByPlan.get(slug) ?? 0) + planRevenue);
    estimatedMrrCents += planRevenue;
  }

  const failedEventsCount = failedEventsResult.error ? 0 : (failedEventsResult.count ?? 0);
  const latestEventCreatedAt = latestSyncResult.error ? null : latestSyncResult.data?.[0]?.created_at ?? null;
  const ownerProfilesCount = ownersCountResult.error ? 0 : (ownersCountResult.count ?? 0);
  const totalProfiles = profilesCountResult.error ? 0 : Math.max((profilesCountResult.count ?? 0) - ownerProfilesCount, 0);
  const freeCount = countByPlan.get("free") ?? 0;
  const premiumLikeCount = Array.from(countByPlan.entries()).reduce((total, [slug, count]) => {
    return slug === "premium" || slug.startsWith("ministry_") ? total + count : total;
  }, 0);
  const conversionRate = freeCount + premiumLikeCount > 0 ? (premiumLikeCount / (freeCount + premiumLikeCount)) * 100 : 0;
  const estimatedArpaCents = paidActiveSubscriptions.length ? Math.round(estimatedMrrCents / paidActiveSubscriptions.length) : 0;
  const estimatedArrCents = estimatedMrrCents * 12;

  const realRevenue7dCents = sumPaidInvoices(paidInvoices, (invoice) => Boolean(invoice.paid_at && new Date(invoice.paid_at) >= sevenDaysAgo));
  const realRevenue30dCents = sumPaidInvoices(paidInvoices, (invoice) => Boolean(invoice.paid_at && new Date(invoice.paid_at) >= thirtyDaysAgo));
  const realRevenueYearCents = sumPaidInvoices(paidInvoices, (invoice) => Boolean(invoice.paid_at && new Date(invoice.paid_at) >= yearStart));
  const realRevenueTotalCents = sumPaidInvoices(paidInvoices, () => true);
  const realArpa30dCents = paidInvoices.length ? Math.round(realRevenue30dCents / Math.max(new Set(paidInvoices.map((invoice) => invoice.customer_email ?? invoice.id)).size, 1)) : 0;

  const revenueByPlan = new Map<string, { name: string; real: number; estimated: number; count: number }>();
  for (const plan of plans) {
    const slug = normalize(plan.slug);
    revenueByPlan.set(slug, {
      name: plan.name,
      real: 0,
      estimated: estimatedRevenueByPlan.get(slug) ?? 0,
      count: countByPlan.get(slug) ?? 0,
    });
  }
  for (const invoice of paidInvoices) {
    const slug = normalize(invoice.plans?.slug) || "sem_plano";
    const current = revenueByPlan.get(slug) ?? { name: invoice.plans?.name ?? "Sem plano", real: 0, estimated: 0, count: 0 };
    current.real += Number(invoice.amount_paid_cents ?? 0);
    revenueByPlan.set(slug, current);
  }

  const featureKeys = Array.from(new Set([...DEFAULT_FEATURES, ...plans.flatMap(readFeatures)]));

  const recentActivity: RecentActivityItem[] = allSubscriptions.slice(0, 12).map((row) => {
    const plan = planById.get(String(row.plan_id));
    const profile = row.profiles;
    return {
      user: profile?.full_name ?? profile?.email ?? "Usuário sem nome",
      email: profile?.email ?? "—",
      plan: plan?.name ?? plan?.slug ?? "Plano desconhecido",
      gateway: row.gateway ?? "—",
      status: mapStatusLabel(row.status),
      createdAt: row.created_at,
      currentPeriodEnd: row.current_period_end ?? row.trial_ends_at ?? null,
    };
  });

  const latestPayments = paidInvoices.slice(0, 8);

  const isStripeConnected = Boolean(process.env.STRIPE_SECRET_KEY);
  const isWebhookActive = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const stripeDashboardUrl = process.env.STRIPE_DASHBOARD_URL || "https://dashboard.stripe.com/";
  const lastSyncLabel = latestEventCreatedAt ? formatDateTime(latestEventCreatedAt) : "sem eventos";

  const stats = [
    {
      label: "Receita real 30 dias",
      value: formatMoney(realRevenue30dCents),
      detail: `${formatCount(paidInvoices.length)} pagamento(s) Stripe salvos • owners excluídos`,
      icon: ChartNoAxesCombined,
      glow: "from-gold-500/20 via-gold-300/5",
    },
    {
      label: "Receita real no ano",
      value: formatMoney(realRevenueYearCents),
      detail: `total histórico salvo: ${formatMoney(realRevenueTotalCents)}`,
      icon: ReceiptText,
      glow: "from-emerald-500/20 via-emerald-300/5",
    },
    {
      label: "MRR estimado ativo",
      value: formatMoney(estimatedMrrCents),
      detail: `${formatCount(paidActiveSubscriptions.length)} pagantes ativos • ARR ${formatMoney(estimatedArrCents)}`,
      icon: WalletCards,
      glow: "from-cyan-500/20 via-cyan-300/5",
    },
    {
      label: "Mix Free → Premium",
      value: `${conversionRate.toFixed(1)}%`,
      detail: `Free ${formatCount(freeCount)} • Premium/Ministério ${formatCount(premiumLikeCount)} • ARPA real 30d ${formatMoney(realArpa30dCents || estimatedArpaCents)}`,
      icon: ArrowRightLeft,
      glow: "from-violet-500/20 via-violet-300/5",
    },
  ];

  const healthItems = [
    { label: "Stripe", value: isStripeConnected ? "Conectado" : "Sem chave" },
    { label: "Webhook", value: isWebhookActive ? "Ativo" : "Secret ausente" },
    { label: "Último sync", value: lastSyncLabel },
    { label: "Eventos falhos", value: formatCount(failedEventsCount) },
    { label: "Invoices reais", value: invoicesResult.error ? "Tabela indisponível" : formatCount(allInvoices.length) },
  ];

  const statusCards = [
    { label: "Em teste", value: trialingCount, helper: "trialing" },
    { label: "Atrasadas", value: overdueCount, helper: "overdue" },
    { label: "Pendentes", value: pendingCount, helper: "pending" },
    { label: "Falhas cobrança", value: failedInvoices.length, helper: "Stripe invoices" },
  ];

  return (
    <section className="space-y-6">
      <PageHeader title="Billing" description="Cockpit de receita real Stripe, planos, permissões, migração e saúde dos gateways." />

      <div className="rounded-2xl border border-gold-500/20 bg-gold-500/10 p-4 text-sm text-gold-100 shadow-premium">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 font-medium">
            <Crown className="h-4 w-4" />
            Owners protegidos por role
          </p>
          <p className="text-xs text-gold-100/70">
            {formatCount(ownerSubscriptionCount)} assinatura(s) de owner removida(s) das métricas financeiras, planos e atividade recente.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, detail, icon: Icon, glow }) => (
          <article key={label} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${glow} to-surface/80 p-5 shadow-premium backdrop-blur`}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
              <Icon className="h-4 w-4 text-gold-300" />
            </div>
            <p className="text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-muted">{detail || "sem dados"}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {statusCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-premium">
            <p className="text-xs uppercase tracking-wide text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{formatCount(card.value)}</p>
            <p className="text-xs text-muted">{card.helper}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Controle de acesso dos planos</h2>
              <p className="mt-1 text-xs text-muted">Permissões lidas dinamicamente do campo features de cada plano ativo.</p>
            </div>
            <Link href="/admin/billing/permissoes" className="rounded-xl border border-gold-400/40 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-gold-200 transition hover:bg-gold-500/20">
              Editar permissões
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-white/10">
                  <th className="sticky left-0 bg-surface px-3 py-2 font-medium">Recurso</th>
                  {plans.map((plan) => (
                    <th key={plan.id} className="px-3 py-2 font-medium">{plan.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureKeys.map((feature) => (
                  <tr key={feature} className="border-b border-white/5 text-muted last:border-none">
                    <td className="sticky left-0 bg-surface px-3 py-3 text-white">{featureLabel(feature)}</td>
                    {plans.map((plan) => {
                      const enabled = readFeatures(plan).includes(feature);
                      return (
                        <td key={`${feature}-${plan.id}`} className="px-3 py-3">
                          <span className={`inline-flex min-w-8 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-zinc-400"}`}>
                            {enabled ? "✓" : "—"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            Stripe Control Center
          </h2>
          <div className="space-y-3">
            {healthItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-[#101827] p-3">
                <p className="text-xs text-muted">{item.label}</p>
                <p className="text-sm font-semibold text-white">{item.value}</p>
              </div>
            ))}
            <a href={stripeDashboardUrl} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir central Stripe
            </a>
          </div>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
            <CreditCard className="h-4 w-4 text-cyan-300" />
            Receita por plano
          </h2>
          <div className="space-y-3">
            {Array.from(revenueByPlan.entries()).map(([slug, data]) => {
              const percent = realRevenueTotalCents > 0 ? Math.max((data.real / realRevenueTotalCents) * 100, data.real > 0 ? 4 : 0) : 0;
              return (
                <div key={slug} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-white">{data.name}</span>
                    <span className="text-muted">real {formatMoney(data.real)} • estimado {formatMoney(data.estimated)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-gradient-to-r from-gold-400 via-cyan-400 to-emerald-400" style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted">{formatCount(data.count)} assinatura(s) ativa(s)</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
            <ReceiptText className="h-4 w-4 text-emerald-300" />
            Últimos pagamentos Stripe
          </h2>
          <div className="space-y-3">
            {latestPayments.map((invoice) => (
              <div key={invoice.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{invoice.customer_email ?? invoice.profiles?.email ?? "Cliente sem e-mail"}</p>
                    <p className="text-xs text-muted">{invoice.plans?.name ?? "Plano não identificado"} • {formatDateTime(invoice.paid_at ?? invoice.created_at)}</p>
                  </div>
                  <span className="font-semibold text-emerald-300">{formatMoney(Number(invoice.amount_paid_cents ?? 0))}</span>
                </div>
              </div>
            ))}
            {latestPayments.length === 0 ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                Nenhum pagamento real salvo ainda. Após a migration e os próximos eventos `invoice.paid`, esta área será preenchida automaticamente.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Activity className="h-4 w-4 text-violet-300" />
            Migração e atividade recente
          </h2>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted">Owners removidos da listagem</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2 font-medium">Plano</th>
                <th className="px-3 py-2 font-medium">Gateway</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Criada em</th>
                <th className="px-3 py-2 font-medium">Renova/expira</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((item, index) => (
                <tr key={`${item.user}-${item.createdAt}-${index}`} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3 text-white">{item.user}</td>
                  <td className="px-3 py-3 text-muted">{item.email}</td>
                  <td className="px-3 py-3 text-muted">{item.plan}</td>
                  <td className="px-3 py-3 text-muted">{item.gateway}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(item.status)}`}>
                      {item.status === "Ativo" ? <BadgeCheck className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                      {item.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted">{formatDateTime(item.createdAt)}</td>
                  <td className="px-3 py-3 text-muted">{formatDateTime(item.currentPeriodEnd)}</td>
                </tr>
              ))}
              {recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted">Nenhuma assinatura não-owner encontrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
