import { Activity, ArrowRightLeft, BadgeCheck, ChartNoAxesCombined, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

type RecentActivityItem = {
  user: string;
  plan: string;
  gateway: string;
  status: string;
  createdAt: string;
};

const permissions = [
  { feature: "Playlists", free: false, plus: true, premium: true },
  { feature: "Troca de tons", free: false, plus: false, premium: true },
  { feature: "Solicitar músicas", free: false, plus: false, premium: true },
  { feature: "Kits premium", free: false, plus: true, premium: true },
];

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function mapStatusLabel(status: SubscriptionRow["status"]) {
  if (status === "active") return "Ativo";
  if (status === "overdue") return "Atrasado";
  if (status === "canceled") return "Cancelado";
  if (status === "expired") return "Expirado";
  return "Pendente";
}

export default async function BillingPage() {
  const supabase = createSupabaseAdminClient() as any;

  const [subscriptionsResult, plansResult, failedEventsResult, latestSyncResult] = await Promise.all([
    supabase.from("subscriptions").select("id,user_id,plan_id,gateway,status,created_at").eq("status", "active"),
    supabase.from("plans").select("id,slug,name,price_cents"),
    supabase.from("billing_events").select("id", { count: "exact", head: true }).eq("processed", false),
    supabase.from("billing_events").select("created_at").order("created_at", { ascending: false }).limit(1),
  ]);

  const activeSubscriptions = ((subscriptionsResult.data ?? []) as Pick<SubscriptionRow, "id" | "user_id" | "plan_id" | "gateway" | "status" | "created_at">[]);
  const plans = (plansResult.data ?? []) as Pick<PlanRow, "id" | "slug" | "name" | "price_cents">[];
  const failedEventsCount = failedEventsResult.error ? 0 : (failedEventsResult.count ?? 0);
  const latestEventCreatedAt = latestSyncResult.error ? null : latestSyncResult.data?.[0]?.created_at ?? null;

  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  const countByPlan = { free: 0, plus: 0, premium: 0 };
  let mrrCents = 0;

  for (const subscription of activeSubscriptions) {
    const plan = planById.get(subscription.plan_id);
    const slug = String(plan?.slug ?? "").toLowerCase();

    if (slug === "free" || slug === "plus" || slug === "premium") {
      countByPlan[slug] += 1;
    }

    if (slug !== "free" && typeof plan?.price_cents === "number") {
      mrrCents += plan.price_cents;
    }
  }

  const gatewayCount = { stripe: 0, manual_migration: 0, migration: 0 };
  for (const subscription of activeSubscriptions) {
    const gateway = String(subscription.gateway ?? "").toLowerCase();
    if (gateway === "stripe" || gateway === "manual_migration" || gateway === "migration") {
      gatewayCount[gateway] += 1;
    }
  }

  const { data: recentRaw } = await supabase
    .from("subscriptions")
    .select("id,user_id,plan_id,gateway,status,created_at,profiles(full_name,email)")
    .order("created_at", { ascending: false })
    .limit(10);

  const recentActivity: RecentActivityItem[] = ((recentRaw ?? []) as any[]).map((row) => {
    const plan = planById.get(String(row.plan_id));
    const profile = row.profiles;
    return {
      user: profile?.full_name ?? profile?.email ?? "Usuário sem nome",
      plan: plan?.name ?? plan?.slug ?? "Plano desconhecido",
      gateway: row.gateway ?? "-",
      status: mapStatusLabel(row.status),
      createdAt: row.created_at,
    };
  });

  const isStripeConnected = Boolean(process.env.STRIPE_SECRET_KEY);
  const isWebhookActive = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const lastSyncLabel = latestEventCreatedAt
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(latestEventCreatedAt))
    : "sem eventos";

  const stats = [
    { label: "MRR estimado", value: formatMoney(mrrCents), detail: `${formatCount(countByPlan.plus + countByPlan.premium)} pagantes ativos`, icon: ChartNoAxesCombined, glow: "from-gold-500/20 via-gold-300/5" },
    { label: "Assinantes ativos", value: formatCount(activeSubscriptions.length), detail: `Free ${formatCount(countByPlan.free)} • Plus ${formatCount(countByPlan.plus)} • Premium ${formatCount(countByPlan.premium)}`, icon: Users, glow: "from-cyan-500/20 via-cyan-300/5" },
    { label: "Conversão Free → Premium", value: "—", detail: "sem cálculo nesta tela", icon: ArrowRightLeft, glow: "from-violet-500/20 via-violet-300/5" },
    { label: "Status Stripe", value: gatewayCount.stripe > 0 ? "Operacional" : "Sem dados", detail: `stripe ${formatCount(gatewayCount.stripe)} • manual ${formatCount(gatewayCount.manual_migration)} • migration ${formatCount(gatewayCount.migration)}`, icon: ShieldCheck, glow: "from-emerald-500/20 via-emerald-300/5" },
  ];

  return (
    <section className="space-y-6">
      <PageHeader title="Billing" description="Visão administrativa de assinaturas, cobrança e gateways." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, detail, icon: Icon, glow }) => (
          <article
            key={label}
            className={`rounded-2xl border border-white/10 bg-gradient-to-br ${glow} to-surface/80 p-5 shadow-premium backdrop-blur`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
              <Icon className="h-4 w-4 text-gold-300" />
            </div>
            <p className="text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-muted">{detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Controle de acesso dos planos</h2>
            <button className="rounded-xl border border-gold-400/40 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-gold-200 transition hover:bg-gold-500/20">
              Editar permissões
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2 font-medium">Recurso</th>
                  <th className="px-3 py-2 font-medium">Free</th>
                  <th className="px-3 py-2 font-medium">Plus</th>
                  <th className="px-3 py-2 font-medium">Premium</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((item) => (
                  <tr key={item.feature} className="border-b border-white/5 text-muted last:border-none">
                    <td className="px-3 py-3 text-white">{item.feature}</td>
                    {[item.free, item.plus, item.premium].map((enabled, idx) => (
                      <td key={`${item.feature}-${idx}`} className="px-3 py-3">
                        <span
                          className={`inline-flex min-w-8 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-zinc-400"
                          }`}
                        >
                          {enabled ? "✓" : "—"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
          <h2 className="mb-4 text-base font-semibold text-white">Stripe Control Center</h2>
          <div className="space-y-3">
            <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-3 text-sm text-cyan-100">
              <p className="font-medium">Stripe conectado</p>
              <p className="text-xs text-cyan-100/70">{isStripeConnected ? "Conta principal ativa." : "Chave STRIPE_SECRET_KEY ausente."}</p>
            </div>
            <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-3 text-sm text-violet-100">
              <p className="font-medium">Webhook ativo</p>
              <p className="text-xs text-violet-100/70">{isWebhookActive ? "Endpoint recebendo eventos." : "Webhook STRIPE_WEBHOOK_SECRET ausente."}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-[#101827] p-3">
                <p className="text-xs text-muted">Último sync</p>
                <p className="text-sm font-semibold text-white">{lastSyncLabel}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#101827] p-3">
                <p className="text-xs text-muted">Eventos falhos</p>
                <p className="text-sm font-semibold text-white">{formatCount(failedEventsCount)}</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-premium">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            <Activity className="h-4 w-4 text-violet-300" />
            Migração e atividade recente
          </h2>
          <button className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/20">
            <Sparkles className="h-3.5 w-3.5" />
            Abrir central Stripe
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">Plano</th>
                <th className="px-3 py-2 font-medium">Gateway</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.map((item, index) => (
                <tr key={`${item.user}-${item.createdAt}-${index}`} className="border-b border-white/5 last:border-none">
                  <td className="px-3 py-3 text-white">{item.user}</td>
                  <td className="px-3 py-3 text-muted">{item.plan}</td>
                  <td className="px-3 py-3 text-muted">{item.gateway}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                        item.status === "Ativo" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                      }`}
                    >
                      {item.status === "Ativo" ? <BadgeCheck className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
              {recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted">Nenhuma assinatura encontrada.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
