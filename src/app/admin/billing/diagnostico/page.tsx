import Link from "next/link";
import { AlertTriangle, ArrowLeft, Database, ReceiptText, RefreshCw, Users } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DiagnosticSubscription = {
  id: string;
  user_id?: string | null;
  plan_id?: string | null;
  status?: string | null;
  gateway?: string | null;
  gateway_customer_id?: string | null;
  gateway_subscription_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type DiagnosticPlan = {
  id: string;
  slug?: string | null;
  name?: string | null;
  price_cents?: number | null;
};

type DiagnosticProfile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
};

type DiagnosticInvoice = {
  id: string;
  provider?: string | null;
  status?: string | null;
  customer_email?: string | null;
  amount_paid_cents?: number | null;
  amount_due_cents?: number | null;
  paid_at?: string | null;
  created_at?: string | null;
};

type DiagnosticEvent = {
  id: string;
  provider?: string | null;
  event_type?: string | null;
  processed?: boolean | null;
  created_at?: string | null;
};

function formatCount(value?: number | null) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function formatMoney(cents?: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

function formatDate(value?: string | null) {
  return formatDateTimeBR(value).replace("-", "—");
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function statusBadge(status?: string | null) {
  const value = normalize(status);
  if (["active", "paid", "trialing", "processed"].includes(value)) return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
  if (["pending", "open"].includes(value)) return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  if (["canceled", "failed", "payment_failed", "overdue"].includes(value)) return "border-rose-400/25 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.04] text-zinc-200";
}

function StatCard({ title, value, caption, icon: Icon }: { title: string; value: string | number; caption: string; icon: any }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 shadow-2xl shadow-black/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{title}</p>
        <Icon className="h-4 w-4 text-cyan-200" />
      </div>
      <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{caption}</p>
    </article>
  );
}

export default async function BillingDiagnosticsPage() {
  const supabase = createSupabaseAdminClient() as any;

  const [
    subscriptionsResult,
    subscriptionsCountResult,
    profilesCountResult,
    plansResult,
    invoicesResult,
    invoicesCountResult,
    eventsResult,
    unprocessedEventsCountResult,
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id,user_id,plan_id,status,gateway,gateway_customer_id,gateway_subscription_id,stripe_customer_id,stripe_subscription_id,current_period_end,trial_ends_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase.from("subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("plans").select("id,slug,name,price_cents").order("price_cents", { ascending: true }),
    supabase
      .from("billing_invoices")
      .select("id,provider,status,customer_email,amount_paid_cents,amount_due_cents,paid_at,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("billing_invoices").select("id", { count: "exact", head: true }),
    supabase
      .from("billing_events")
      .select("id,provider,event_type,processed,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("billing_events").select("id", { count: "exact", head: true }).eq("processed", false),
  ]);

  const subscriptions = (subscriptionsResult.data ?? []) as DiagnosticSubscription[];
  const profilesCount = profilesCountResult.count ?? 0;
  const subscriptionsCount = subscriptionsCountResult.count ?? subscriptions.length;
  const plans = (plansResult.data ?? []) as DiagnosticPlan[];
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const invoices = invoicesResult.error ? [] : ((invoicesResult.data ?? []) as DiagnosticInvoice[]);
  const events = eventsResult.error ? [] : ((eventsResult.data ?? []) as DiagnosticEvent[]);

  const errors = [
    ["subscriptions", subscriptionsResult.error?.message],
    ["subscriptions_count", subscriptionsCountResult.error?.message],
    ["profiles_count", profilesCountResult.error?.message],
    ["plans", plansResult.error?.message],
    ["billing_invoices", invoicesResult.error?.message],
    ["billing_invoices_count", invoicesCountResult.error?.message],
    ["billing_events", eventsResult.error?.message],
    ["unprocessed_events_count", unprocessedEventsCountResult.error?.message],
  ].filter(([, message]) => Boolean(message));

  const activeCount = subscriptions.filter((item) => ["active", "trialing"].includes(normalize(item.status))).length;
  const pendingCount = subscriptions.filter((item) => normalize(item.status) === "pending").length;
  const stripeCount = subscriptions.filter((item) => normalize(item.gateway) === "stripe").length;
  const asaasCount = subscriptions.filter((item) => normalize(item.gateway) === "asaas").length;

  return (
    <section className="space-y-6 text-zinc-100">
      <PageHeader title="Diagnóstico de Billing" description="Leitura bruta das tabelas financeiras para auditar checkout, webhooks e assinaturas." />

      <Link href="/admin/billing" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-zinc-200 hover:bg-white/[0.08]">
        <ArrowLeft className="h-4 w-4" /> Voltar ao Billing
      </Link>

      {errors.length ? (
        <div className="rounded-3xl border border-rose-400/25 bg-rose-500/10 p-5 text-sm text-rose-100">
          <div className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Erros detectados nas consultas</div>
          <div className="space-y-2">
            {errors.map(([source, message]) => (
              <p key={source}><strong>{source}:</strong> {message}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Profiles" value={formatCount(profilesCount)} caption="usuários cadastrados" icon={Users} />
        <StatCard title="Subscriptions" value={formatCount(subscriptionsCount)} caption="registros na tabela" icon={Database} />
        <StatCard title="Ativos/Teste" value={formatCount(activeCount)} caption="active + trialing nos 30 recentes" icon={RefreshCw} />
        <StatCard title="Pendentes" value={formatCount(pendingCount)} caption="checkout iniciado" icon={AlertTriangle} />
        <StatCard title="Stripe" value={formatCount(stripeCount)} caption="nos 30 recentes" icon={ReceiptText} />
        <StatCard title="Asaas" value={formatCount(asaasCount)} caption="nos 30 recentes" icon={ReceiptText} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5 shadow-2xl shadow-black/20">
          <h2 className="mb-4 text-lg font-semibold text-white">Últimas assinaturas brutas</h2>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Gateway</th>
                  <th className="px-3 py-2">Plano</th>
                  <th className="px-3 py-2">User ID</th>
                  <th className="px-3 py-2">Gateway Sub</th>
                  <th className="px-3 py-2">Renova/Trial</th>
                  <th className="px-3 py-2">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((row) => {
                  const plan = row.plan_id ? planById.get(row.plan_id) : null;
                  return (
                    <tr key={row.id} className="border-b border-white/5 last:border-none">
                      <td className="px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs ${statusBadge(row.status)}`}>{row.status ?? "—"}</span></td>
                      <td className="px-3 py-3 text-zinc-300">{row.gateway ?? "—"}</td>
                      <td className="px-3 py-3 text-zinc-300">{plan?.name ?? plan?.slug ?? row.plan_id ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-500">{row.user_id ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-500">{row.gateway_subscription_id ?? row.stripe_subscription_id ?? "—"}</td>
                      <td className="px-3 py-3 text-zinc-400">{formatDate(row.current_period_end ?? row.trial_ends_at)}</td>
                      <td className="px-3 py-3 text-zinc-400">{formatDate(row.updated_at ?? row.created_at)}</td>
                    </tr>
                  );
                })}
                {subscriptions.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">Nenhum registro em subscriptions.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5 shadow-2xl shadow-black/20">
            <h2 className="mb-4 text-lg font-semibold text-white">Eventos de billing</h2>
            <p className="mb-3 text-sm text-zinc-500">Não processados: {formatCount(unprocessedEventsCountResult.count ?? 0)}</p>
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="font-medium text-white">{event.event_type ?? "sem tipo"}</p><p className="text-xs text-zinc-500">{event.provider ?? "—"} · {formatDate(event.created_at)}</p></div>
                    <span className={`rounded-full border px-2 py-1 text-xs ${statusBadge(event.processed ? "processed" : "pending")}`}>{event.processed ? "processado" : "pendente"}</span>
                  </div>
                </div>
              ))}
              {events.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">Nenhum evento em billing_events.</p> : null}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5 shadow-2xl shadow-black/20">
            <h2 className="mb-4 text-lg font-semibold text-white">Faturas recentes</h2>
            <p className="mb-3 text-sm text-zinc-500">Total: {formatCount(invoicesCountResult.count ?? invoices.length)}</p>
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="font-medium text-white">{invoice.customer_email ?? "sem e-mail"}</p><p className="text-xs text-zinc-500">{invoice.provider ?? "—"} · {formatDate(invoice.paid_at ?? invoice.created_at)}</p></div>
                    <div className="text-right"><p className="font-semibold text-emerald-300">{formatMoney(invoice.amount_paid_cents ?? invoice.amount_due_cents)}</p><span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-xs ${statusBadge(invoice.status)}`}>{invoice.status ?? "—"}</span></div>
                  </div>
                </div>
              ))}
              {invoices.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-500">Nenhuma fatura em billing_invoices.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
