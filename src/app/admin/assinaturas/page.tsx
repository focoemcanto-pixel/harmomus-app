import Link from "next/link";
import { AlertTriangle, ArrowRight, BadgeCheck, Crown, Flame, RefreshCw, TrendingUp, UserRoundCheck, Users, WalletCards } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SubscriptionRow = {
  id: string;
  user_id?: string | null;
  plan_id?: string | null;
  status?: string | null;
  gateway?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  canceled_at?: string | null;
  auto_renew?: boolean | null;
  profiles?: { full_name?: string | null; email?: string | null; phone?: string | null; role?: string | null } | null;
  plans?: { id?: string | null; name?: string | null; slug?: string | null; price_cents?: number | null; hierarchy_level?: number | null } | null;
};

type AccessLogRow = {
  user_id?: string | null;
  status?: string | null;
  reason?: string | null;
  accessed_at?: string | null;
  created_at?: string | null;
  profiles?: { full_name?: string | null; email?: string | null; phone?: string | null; role?: string | null } | null;
  kits?: { name?: string | null; slug?: string | null } | null;
};

type InvoiceRow = {
  id: string;
  status?: string | null;
  amount_paid_cents?: number | null;
  amount_due_cents?: number | null;
  paid_at?: string | null;
  created_at?: string | null;
  hosted_invoice_url?: string | null;
  customer_email?: string | null;
  profiles?: { full_name?: string | null; email?: string | null; role?: string | null } | null;
  plans?: { name?: string | null; slug?: string | null } | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isOwner(profile?: { role?: string | null } | null) {
  return normalize(profile?.role) === "owner";
}

function isActive(status?: string | null) {
  return ["active", "trialing"].includes(normalize(status));
}

function isPaidPlan(plan?: SubscriptionRow["plans"]) {
  return normalize(plan?.slug) !== "free" && Number(plan?.price_cents ?? 0) > 0;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatDate(value?: string | null) {
  return formatDateTimeBR(value).replace("-", "—");
}

function statusLabel(status?: string | null) {
  const value = normalize(status);
  if (value === "active") return "Ativo";
  if (value === "trialing") return "Teste";
  if (value === "pending") return "Pendente";
  if (value === "overdue") return "Atrasado";
  if (value === "canceled") return "Cancelado";
  if (value === "expired") return "Expirado";
  return "Indefinido";
}

function statusClass(status?: string | null) {
  const label = statusLabel(status);
  if (["Ativo", "Pago"].includes(label)) return "border-emerald-400/25 bg-emerald-500/10 text-emerald-200";
  if (label === "Teste") return "border-cyan-400/25 bg-cyan-500/10 text-cyan-100";
  if (["Atrasado", "Pendente"].includes(label)) return "border-amber-400/25 bg-amber-500/10 text-amber-100";
  return "border-rose-400/25 bg-rose-500/10 text-rose-100";
}

function planFamily(slug?: string | null) {
  const value = normalize(slug);
  if (value.startsWith("ministry")) return "Ministerial";
  if (value === "premium") return "Premium";
  if (value === "plus") return "Plus";
  if (value === "free") return "Free";
  return "Sem plano";
}

function StatCard({ title, value, caption, tone = "cyan", icon: Icon }: { title: string; value: string | number; caption: string; tone?: "cyan" | "emerald" | "amber" | "rose" | "violet"; icon: any }) {
  const tones = {
    cyan: "from-cyan-500/15 via-zinc-950/70 to-zinc-950/80 border-cyan-400/20",
    emerald: "from-emerald-500/15 via-zinc-950/70 to-zinc-950/80 border-emerald-400/20",
    amber: "from-amber-500/15 via-zinc-950/70 to-zinc-950/80 border-amber-400/20",
    rose: "from-rose-500/15 via-zinc-950/70 to-zinc-950/80 border-rose-400/20",
    violet: "from-violet-500/15 via-zinc-950/70 to-zinc-950/80 border-violet-400/20",
  };
  return (
    <article className={`rounded-3xl border bg-gradient-to-br ${tones[tone]} p-5 shadow-2xl shadow-black/20`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{title}</p>
        <Icon className="h-4 w-4 text-white/70" />
      </div>
      <p className="text-3xl font-semibold tracking-tight text-white">{typeof value === "number" ? formatCount(value) : value}</p>
      <p className="mt-1 text-xs text-zinc-500">{caption}</p>
    </article>
  );
}

function rankLead(playCount: number, deniedCount: number) {
  const score = playCount + deniedCount * 4;
  if (score >= 35) return { label: "🔥 Muito quente", tone: "border-rose-400/30 bg-rose-500/10 text-rose-100", score };
  if (score >= 18) return { label: "🟡 Quente", tone: "border-amber-400/30 bg-amber-500/10 text-amber-100", score };
  return { label: "Morno", tone: "border-white/10 bg-white/[0.03] text-zinc-300", score };
}

async function getSubscriptionCenterData() {
  const supabase = createSupabaseAdminClient() as any;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [subscriptionsResult, invoicesResult, logsResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id,user_id,plan_id,status,gateway,created_at,updated_at,current_period_end,trial_ends_at,canceled_at,auto_renew,profiles(full_name,email,phone,role),plans(id,name,slug,price_cents,hierarchy_level)")
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("billing_invoices")
      .select("id,status,amount_paid_cents,amount_due_cents,paid_at,created_at,hosted_invoice_url,customer_email,profiles(full_name,email,role),plans(name,slug)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("audio_access_logs")
      .select("user_id,status,reason,accessed_at,created_at,profiles(full_name,email,phone,role),kits(name,slug)")
      .gte("accessed_at", since30)
      .order("accessed_at", { ascending: false })
      .limit(4000),
  ]);

  const subscriptions = ((subscriptionsResult.data ?? []) as SubscriptionRow[]).filter((row) => !isOwner(row.profiles));
  const invoices = invoicesResult.error ? [] : ((invoicesResult.data ?? []) as InvoiceRow[]).filter((row) => !isOwner(row.profiles));
  const accessLogs = logsResult.error ? [] : ((logsResult.data ?? []) as AccessLogRow[]).filter((row) => !isOwner(row.profiles));

  return { subscriptions, invoices, accessLogs, invoiceError: invoicesResult.error?.message ?? null, logsError: logsResult.error?.message ?? null };
}

export default async function AdminSubscriptionsPage() {
  const { subscriptions, invoices, accessLogs, invoiceError, logsError } = await getSubscriptionCenterData();

  const active = subscriptions.filter((row) => isActive(row.status));
  const paidActive = active.filter((row) => isPaidPlan(row.plans));
  const trialing = subscriptions.filter((row) => normalize(row.status) === "trialing");
  const overdue = subscriptions.filter((row) => ["overdue", "past_due", "pending"].includes(normalize(row.status)));
  const canceled = subscriptions.filter((row) => normalize(row.status) === "canceled");
  const free = active.filter((row) => normalize(row.plans?.slug) === "free");
  const plus = active.filter((row) => normalize(row.plans?.slug) === "plus");
  const premiumLike = active.filter((row) => normalize(row.plans?.slug) === "premium" || normalize(row.plans?.slug).startsWith("ministry"));

  const estimatedMrr = paidActive.reduce((total, row) => total + Number(row.plans?.price_cents ?? 0), 0);
  const paidInvoices = invoices.filter((row) => normalize(row.status) === "paid" && Number(row.amount_paid_cents ?? 0) > 0);
  const failedInvoices = invoices.filter((row) => ["open", "uncollectible", "void", "payment_failed"].includes(normalize(row.status)) && Number(row.amount_due_cents ?? 0) > 0);
  const revenue30d = paidInvoices
    .filter((row) => row.paid_at && new Date(row.paid_at).getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000)
    .reduce((total, row) => total + Number(row.amount_paid_cents ?? 0), 0);

  const engagementByUser = new Map<string, { userId: string; name: string; email: string; phone: string; plays: number; denied: number; lastKit: string; lastSeen: string }>();
  for (const log of accessLogs) {
    if (!log.user_id) continue;
    const current = engagementByUser.get(log.user_id) ?? {
      userId: log.user_id,
      name: log.profiles?.full_name ?? log.profiles?.email ?? "Usuário sem nome",
      email: log.profiles?.email ?? "—",
      phone: log.profiles?.phone ?? "—",
      plays: 0,
      denied: 0,
      lastKit: log.kits?.name ?? "Kit não informado",
      lastSeen: log.accessed_at ?? log.created_at ?? "",
    };
    if (normalize(log.status) === "allowed") current.plays += 1;
    if (normalize(log.status) === "denied") current.denied += 1;
    if (!current.lastSeen || new Date(log.accessed_at ?? log.created_at ?? 0) > new Date(current.lastSeen)) {
      current.lastSeen = log.accessed_at ?? log.created_at ?? current.lastSeen;
      current.lastKit = log.kits?.name ?? current.lastKit;
    }
    engagementByUser.set(log.user_id, current);
  }

  const planByUser = new Map(subscriptions.map((row) => [row.user_id, normalize(row.plans?.slug) || "free"]));
  const upgradeLeads = Array.from(engagementByUser.values())
    .filter((row) => ["free", "plus", ""].includes(planByUser.get(row.userId) ?? "free"))
    .filter((row) => row.denied > 0 || row.plays >= 5)
    .map((row) => ({ ...row, rank: rankLead(row.plays, row.denied), currentPlan: planFamily(planByUser.get(row.userId)) }))
    .sort((a, b) => b.rank.score - a.rank.score)
    .slice(0, 10);

  const recentSubscriptions = subscriptions.slice(0, 20);
  const recoveryQueue = [...overdue, ...canceled.slice(0, 10)].slice(0, 12);

  const premiumMix = active.length ? Math.round((premiumLike.length / active.length) * 100) : 0;
  const plusToPremiumSignal = plus.length ? Math.round((premiumLike.length / Math.max(plus.length + premiumLike.length, 1)) * 100) : 0;

  return (
    <section className="space-y-6 text-zinc-100">
      <PageHeader title="Central de Assinaturas" description="Cockpit comercial para receita, assinantes, upgrades e recuperação do Harmomus." />

      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_32%),rgba(9,9,11,0.84)] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-200/80">Revenue OS</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Assinaturas, upgrades e recuperação</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Esta central usa `subscriptions`, `plans`, `billing_invoices` e comportamento recente de consumo para mostrar onde há receita ativa e oportunidade comercial.</p>
          </div>
          <Link href="/admin/billing" className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-100 hover:bg-cyan-500/15">
            Abrir Billing técnico <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {(invoiceError || logsError) ? (
          <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
            {invoiceError ? `billing_invoices: ${invoiceError}. ` : ""}{logsError ? `audio_access_logs: ${logsError}.` : ""}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="MRR estimado" value={formatMoney(estimatedMrr)} caption={`${paidActive.length} pagantes ativos`} tone="emerald" icon={WalletCards} />
        <StatCard title="Receita 30d" value={formatMoney(revenue30d)} caption="Faturas pagas salvas" tone="cyan" icon={CreditCardIcon} />
        <StatCard title="Assinantes" value={active.length} caption={`${free.length} Free · ${plus.length} Plus · ${premiumLike.length} Premium`} icon={Users} />
        <StatCard title="Mix Premium" value={`${premiumMix}%`} caption="Premium/Ministerial na base ativa" tone="violet" icon={Crown} />
        <StatCard title="Leads upgrade" value={upgradeLeads.length} caption="Com consumo ou bloqueio recente" tone="amber" icon={Flame} />
        <StatCard title="Recuperação" value={recoveryQueue.length} caption={`${overdue.length} atrasados/pendentes · ${canceled.length} cancelados`} tone={recoveryQueue.length ? "rose" : "emerald"} icon={AlertTriangle} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5 shadow-2xl shadow-black/20">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Upgrade Center</h2>
              <p className="mt-1 text-sm text-zinc-500">Usuários Free/Plus com maior sinal de compra nos últimos 30 dias.</p>
            </div>
            <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">Plus → Premium signal {plusToPremiumSignal}%</span>
          </div>
          {upgradeLeads.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">Nenhum lead quente detectado ainda.</div>
          ) : (
            <div className="space-y-3">
              {upgradeLeads.map((lead) => (
                <article key={lead.userId} className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-white">{lead.name}</h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${lead.rank.tone}`}>{lead.rank.label}</span>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{lead.email} · Plano atual: {lead.currentPlan}</p>
                    </div>
                    <div className="text-right text-xs text-zinc-500">
                      <p>{lead.plays} plays</p>
                      <p className="text-rose-200">{lead.denied} bloqueios</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs"><span className="text-zinc-500">Último kit</span><p className="mt-1 text-zinc-200">{lead.lastKit}</p></div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs"><span className="text-zinc-500">Último acesso</span><p className="mt-1 text-zinc-200">{formatDate(lead.lastSeen)}</p></div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs"><span className="text-zinc-500">WhatsApp</span><p className="mt-1 text-zinc-200">{lead.phone}</p></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5 shadow-2xl shadow-black/20">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><RefreshCw className="h-4 w-4 text-rose-300" /> Recuperação</h2>
          <p className="mt-1 text-sm text-zinc-500">Assinaturas com maior risco operacional/comercial.</p>
          <div className="mt-5 space-y-3">
            {recoveryQueue.map((row) => (
              <div key={row.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{row.profiles?.full_name ?? row.profiles?.email ?? "Usuário sem nome"}</p>
                    <p className="truncate text-xs text-zinc-500">{row.plans?.name ?? "Plano não informado"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">Renova/expira: {formatDate(row.current_period_end ?? row.trial_ends_at)}</p>
              </div>
            ))}
            {recoveryQueue.length === 0 ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">Nenhuma recuperação crítica agora.</div> : null}
          </div>
        </aside>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5 shadow-2xl shadow-black/20">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white"><UserRoundCheck className="h-4 w-4 text-emerald-300" /> Assinantes recentes</h2>
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/10"><th className="px-3 py-2">Usuário</th><th className="px-3 py-2">Plano</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Gateway</th><th className="px-3 py-2">Renova/expira</th></tr>
              </thead>
              <tbody>
                {recentSubscriptions.map((row) => (
                  <tr key={row.id} className="border-b border-white/5 last:border-none">
                    <td className="px-3 py-3"><p className="font-medium text-white">{row.profiles?.full_name ?? "Usuário sem nome"}</p><p className="text-xs text-zinc-500">{row.profiles?.email ?? "—"}</p></td>
                    <td className="px-3 py-3 text-zinc-300">{row.plans?.name ?? planFamily(row.plans?.slug)}</td>
                    <td className="px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td>
                    <td className="px-3 py-3 text-zinc-400">{row.gateway ?? "—"}</td>
                    <td className="px-3 py-3 text-zinc-400">{formatDate(row.current_period_end ?? row.trial_ends_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5 shadow-2xl shadow-black/20">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white"><BadgeCheck className="h-4 w-4 text-cyan-300" /> Faturas recentes</h2>
          <div className="space-y-3">
            {invoices.slice(0, 12).map((invoice) => (
              <article key={invoice.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{invoice.profiles?.full_name ?? invoice.customer_email ?? "Cliente sem nome"}</p>
                    <p className="text-xs text-zinc-500">{invoice.plans?.name ?? "Plano não informado"} · {formatDate(invoice.paid_at ?? invoice.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-emerald-300">{formatMoney(Number(invoice.amount_paid_cents ?? invoice.amount_due_cents ?? 0))}</p>
                    <span className={`mt-1 inline-flex rounded-full border px-2 py-1 text-[10px] ${normalize(invoice.status) === "paid" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>{normalize(invoice.status) || "sem status"}</span>
                  </div>
                </div>
              </article>
            ))}
            {invoices.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">Nenhuma fatura salva ainda.</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-5">
        <h2 className="text-lg font-semibold text-white">Próxima etapa recomendada</h2>
        <p className="mt-1 text-sm text-zinc-500">Para transformar esta central em histórico completo de upgrades/downgrades, o próximo passo é criar uma tabela `subscription_history` gravada sempre que `plan_id` muda.</p>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">Histórico limpo Free → Plus → Premium</div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">Churn real por mês e motivo</div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs text-zinc-300">Campanhas LabMessage por lead quente</div>
        </div>
      </div>
    </section>
  );
}

function CreditCardIcon(props: any) {
  return <TrendingUp {...props} />;
}
