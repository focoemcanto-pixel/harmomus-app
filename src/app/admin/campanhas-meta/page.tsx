import { AlertTriangle, BadgeCheck, BarChart3, LogIn, MousePointerClick, ShoppingCart, Sparkles, Target, TrendingUp, Trophy, Users } from "lucide-react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OWNER_EMAILS = new Set([
  "markuezemarquinhos@hotmail.com",
  "markuezemarquinhos@gmail.com",
  "banda.harmonics@hotmail.com",
  "bandamarcosfive@gmail.com",
]);

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due", "overdue"]);
const UNKNOWN = "Não identificado";

const FUNNEL_EVENTS = ["Lead_free_signup", "CompleteRegistration_first_login", "InitiateCheckout_premium", "Purchase_premium"] as const;

const FALLBACK_PRICES: Record<string, number> = {
  free: 0,
  plus: 19.9,
  premium: 39.9,
  ministry_10: 397,
  ministry_20: 697,
  ministry_40: 1297,
};

type ProfileInfo = {
  email?: string | null;
  full_name?: string | null;
};

type PlanInfo = {
  slug?: string | null;
  name?: string | null;
  price_cents?: number | null;
};

type SubscriptionRow = {
  id: string;
  user_id?: string | null;
  plan_id?: string | null;
  status?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  profiles?: ProfileInfo | ProfileInfo[] | null;
  plans?: PlanInfo | PlanInfo[] | null;
};

type RankedGroup = {
  key: string;
  label: string;
  campaign: string;
  source: string;
  medium: string;
  subscribers: number;
  active: number;
  plus: number;
  premium: number;
  mrr: number;
  lastAt: string | null;
};

type MetaFunnelEventName = (typeof FUNNEL_EVENTS)[number];

type MetaFunnelEventRow = {
  id: string;
  event_name?: string | null;
  user_id?: string | null;
  anonymous_id?: string | null;
  event_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

type ConversionFunnelGroup = {
  key: string;
  campaign: string;
  lead: number;
  login: number;
  checkout: number;
  purchase: number;
  leadToLogin: number;
  loginToCheckout: number;
  checkoutToPremium: number;
  lastAt: string | null;
};

type FetchResult = {
  rows: SubscriptionRow[];
  errorMessage: string | null;
  fallbackMessage: string | null;
};

type FunnelFetchResult = {
  rows: MetaFunnelEventRow[];
  errorMessage: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanLabel(value?: string | null, fallback = UNKNOWN) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function profileOf(row: SubscriptionRow): ProfileInfo | null {
  return Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : (row.profiles ?? null);
}

function planOf(row: SubscriptionRow): PlanInfo | null {
  return Array.isArray(row.plans) ? (row.plans[0] ?? null) : (row.plans ?? null);
}

function isExcludedOwner(row: SubscriptionRow) {
  return OWNER_EMAILS.has(normalize(profileOf(row)?.email));
}

function hasUtm(row: SubscriptionRow) {
  return Boolean(row.utm_source || row.utm_medium || row.utm_campaign || row.utm_content || row.utm_term || row.fbclid || row.gclid);
}

function isMetaAttributed(row: SubscriptionRow) {
  const source = normalize(row.utm_source);
  return source.includes("facebook") || source.includes("instagram") || source.includes("meta") || Boolean(row.fbclid);
}

function isActive(row: SubscriptionRow) {
  return ACTIVE_STATUSES.has(normalize(row.status));
}

function isPlus(row: SubscriptionRow) {
  return normalize(planOf(row)?.slug) === "plus";
}

function isPremium(row: SubscriptionRow) {
  const slug = normalize(planOf(row)?.slug);
  return slug === "premium" || slug.startsWith("ministry");
}

function planPrice(row: SubscriptionRow) {
  const plan = planOf(row);
  const priceFromDb = Number(plan?.price_cents ?? 0);
  if (priceFromDb > 0) return priceFromDb / 100;

  const slug = normalize(plan?.slug) || "free";
  if (slug in FALLBACK_PRICES) return FALLBACK_PRICES[slug];
  if (slug.startsWith("ministry")) return FALLBACK_PRICES.ministry_10;
  return 0;
}

function planLabel(row: SubscriptionRow) {
  const plan = planOf(row);
  if (plan?.name) return plan.name;
  const slug = normalize(plan?.slug);
  if (slug === "plus") return "Plus";
  if (slug === "premium") return "Premium";
  if (slug.startsWith("ministry")) return "Ministerial";
  if (slug === "free") return "Free";
  return UNKNOWN;
}

function mrrOf(rows: SubscriptionRow[]) {
  return rows.filter(isActive).reduce((total, row) => total + planPrice(row), 0);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

function ratioPercent(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function formatDate(value?: string | null, withYear = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: withYear ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sortRankings<T extends { mrr: number; premium: number; subscribers?: number }>(items: T[]) {
  return items.sort((a, b) => b.mrr - a.mrr || b.premium - a.premium || Number(b.subscribers ?? 0) - Number(a.subscribers ?? 0));
}

function aggregateCampaigns(rows: SubscriptionRow[]) {
  const map = new Map<string, RankedGroup>();

  for (const row of rows) {
    const source = cleanLabel(row.utm_source);
    const medium = cleanLabel(row.utm_medium);
    const campaign = cleanLabel(row.utm_campaign);
    const key = `${normalize(source)}::${normalize(medium)}::${normalize(campaign)}`;
    const current = map.get(key) ?? {
      key,
      label: campaign,
      campaign,
      source,
      medium,
      subscribers: 0,
      active: 0,
      plus: 0,
      premium: 0,
      mrr: 0,
      lastAt: null,
    };

    current.subscribers += 1;
    if (isActive(row)) {
      current.active += 1;
      current.mrr += planPrice(row);
    }
    if (isPlus(row)) current.plus += 1;
    if (isPremium(row)) current.premium += 1;
    if (!current.lastAt || (row.created_at && row.created_at > current.lastAt)) current.lastAt = row.created_at ?? current.lastAt;
    map.set(key, current);
  }

  return sortRankings(Array.from(map.values()));
}

function aggregateByUtm(rows: SubscriptionRow[], field: "utm_content" | "utm_term") {
  const map = new Map<string, RankedGroup>();

  for (const row of rows) {
    const label = cleanLabel(row[field]);
    const campaign = cleanLabel(row.utm_campaign);
    const key = `${normalize(label)}::${normalize(campaign)}`;
    const current = map.get(key) ?? {
      key,
      label,
      campaign,
      source: cleanLabel(row.utm_source),
      medium: cleanLabel(row.utm_medium),
      subscribers: 0,
      active: 0,
      plus: 0,
      premium: 0,
      mrr: 0,
      lastAt: null,
    };

    current.subscribers += 1;
    if (isActive(row)) {
      current.active += 1;
      current.mrr += planPrice(row);
    }
    if (isPlus(row)) current.plus += 1;
    if (isPremium(row)) current.premium += 1;
    if (!current.lastAt || (row.created_at && row.created_at > current.lastAt)) current.lastAt = row.created_at ?? current.lastAt;
    map.set(key, current);
  }

  return sortRankings(Array.from(map.values()));
}

function payloadText(row: MetaFunnelEventRow, key: string) {
  const value = row.payload?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function funnelEventName(row: MetaFunnelEventRow): MetaFunnelEventName | null {
  return FUNNEL_EVENTS.includes(row.event_name as MetaFunnelEventName) ? (row.event_name as MetaFunnelEventName) : null;
}

function funnelCampaign(row: MetaFunnelEventRow) {
  return cleanLabel(row.utm_campaign ?? payloadText(row, "utm_campaign"));
}

function aggregateConversionFunnel(events: MetaFunnelEventRow[]) {
  const map = new Map<string, Omit<ConversionFunnelGroup, "leadToLogin" | "loginToCheckout" | "checkoutToPremium">>();

  for (const row of events) {
    const eventName = funnelEventName(row);
    if (!eventName) continue;

    const campaign = funnelCampaign(row);
    const key = normalize(campaign);
    const current = map.get(key) ?? { key, campaign, lead: 0, login: 0, checkout: 0, purchase: 0, lastAt: null };

    if (eventName === "Lead_free_signup") current.lead += 1;
    if (eventName === "CompleteRegistration_first_login") current.login += 1;
    if (eventName === "InitiateCheckout_premium") current.checkout += 1;
    if (eventName === "Purchase_premium") current.purchase += 1;
    if (!current.lastAt || (row.created_at && row.created_at > current.lastAt)) current.lastAt = row.created_at ?? current.lastAt;
    map.set(key, current);
  }

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      leadToLogin: ratioPercent(group.login, group.lead),
      loginToCheckout: ratioPercent(group.checkout, group.login),
      checkoutToPremium: ratioPercent(group.purchase, group.checkout),
    }))
    .sort((a, b) => b.purchase - a.purchase || b.checkout - a.checkout || b.login - a.login || b.lead - a.lead || a.campaign.localeCompare(b.campaign));
}

async function fetchSubscriptions(): Promise<FetchResult> {
  const supabase = createSupabaseAdminClient() as any;
  const relationSelect = "id,user_id,plan_id,status,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,gclid,created_at,updated_at,profiles(email,full_name),plans(slug,name,price_cents)";
  const baseSelect = "id,user_id,plan_id,status,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,gclid,created_at,updated_at";

  const relationResult = await supabase.from("subscriptions").select(relationSelect).order("created_at", { ascending: false }).limit(1000);
  if (!relationResult.error) return { rows: relationResult.data ?? [], errorMessage: null, fallbackMessage: null };

  const baseResult = await supabase.from("subscriptions").select(baseSelect).order("created_at", { ascending: false }).limit(1000);
  if (baseResult.error) return { rows: [], errorMessage: baseResult.error.message, fallbackMessage: relationResult.error.message };

  const rows = (baseResult.data ?? []) as SubscriptionRow[];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
  const planIds = Array.from(new Set(rows.map((row) => row.plan_id).filter(Boolean)));

  const [profilesResult, plansResult] = await Promise.all([
    userIds.length ? supabase.from("profiles").select("id,email,full_name").in("id", userIds) : Promise.resolve({ data: [], error: null }),
    planIds.length ? supabase.from("plans").select("id,slug,name,price_cents").in("id", planIds) : Promise.resolve({ data: [], error: null }),
  ]);

  const profilesById = new Map<string, ProfileInfo>((profilesResult.data ?? []).map((profile: any) => [profile.id, { email: profile.email, full_name: profile.full_name }]));
  const plansById = new Map<string, PlanInfo>((plansResult.data ?? []).map((plan: any) => [plan.id, { slug: plan.slug, name: plan.name, price_cents: plan.price_cents }]));

  return {
    rows: rows.map((row) => ({ ...row, profiles: row.user_id ? profilesById.get(row.user_id) : null, plans: row.plan_id ? plansById.get(row.plan_id) : null })),
    errorMessage: null,
    fallbackMessage: [
      relationResult.error.message,
      profilesResult.error ? `profiles: ${profilesResult.error.message}` : null,
      plansResult.error ? `plans: ${plansResult.error.message}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

async function fetchMetaFunnelEvents(): Promise<FunnelFetchResult> {
  const supabase = createSupabaseAdminClient() as any;
  const result = await supabase
    .from("meta_funnel_events")
    .select("id,event_name,user_id,anonymous_id,event_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,gclid,payload,created_at")
    .in("event_name", FUNNEL_EVENTS)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (result.error) return { rows: [], errorMessage: result.error.message };
  return { rows: result.data ?? [], errorMessage: null };
}

function MetricCard({ title, value, caption, tone, icon: Icon }: { title: string; value: string; caption: string; tone: "cyan" | "emerald" | "amber" | "violet" | "rose"; icon: any }) {
  const tones = {
    cyan: "from-cyan-500/15 via-zinc-950/80 to-blue-500/10 border-cyan-400/20 text-cyan-100",
    emerald: "from-emerald-500/15 via-zinc-950/80 to-cyan-500/10 border-emerald-400/20 text-emerald-100",
    amber: "from-amber-500/15 via-zinc-950/80 to-zinc-950/80 border-amber-400/20 text-amber-100",
    violet: "from-violet-500/15 via-zinc-950/80 to-fuchsia-500/10 border-violet-400/20 text-violet-100",
    rose: "from-rose-500/15 via-zinc-950/80 to-zinc-950/80 border-rose-400/20 text-rose-100",
  };

  return (
    <article className={`rounded-3xl border bg-gradient-to-br ${tones[tone]} p-5 shadow-2xl shadow-black/20`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{title}</p>
        <Icon className="h-4 w-4 text-white/70" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{caption}</p>
    </article>
  );
}

function SectionCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/65 shadow-2xl shadow-black/25">
      <div className="border-b border-white/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function DiagnosticAlert({ tone, title, description }: { tone: "cyan" | "emerald" | "amber" | "rose"; title: string; description: string }) {
  const tones = {
    cyan: "border-cyan-400/20 bg-cyan-500/10 text-cyan-100",
    emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-100",
    rose: "border-rose-400/20 bg-rose-500/10 text-rose-100",
  };

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        {tone === "emerald" ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const value = normalize(status);
  const tone = value === "active" || value === "trialing" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : value === "pending" || value === "past_due" || value === "overdue" ? "border-amber-400/25 bg-amber-500/10 text-amber-100" : "border-white/10 bg-white/5 text-zinc-200";
  return <span className={`rounded-full border px-2.5 py-1 text-xs ${tone}`}>{cleanLabel(status, "Sem status")}</span>;
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-zinc-500">
        {message}
      </td>
    </tr>
  );
}

export default async function CampanhasMetaPage() {
  const [{ rows: fetchedRows, errorMessage, fallbackMessage }, { rows: funnelEvents, errorMessage: funnelErrorMessage }] = await Promise.all([fetchSubscriptions(), fetchMetaFunnelEvents()]);
  const rows = fetchedRows.filter((row) => !isExcludedOwner(row));
  const attributedRows = rows.filter(hasUtm);
  const metaRows = attributedRows.filter(isMetaAttributed);
  const rankingRows = metaRows.length ? metaRows : attributedRows;

  const campaigns = aggregateCampaigns(rankingRows).slice(0, 12);
  const creatives = aggregateByUtm(rankingRows, "utm_content").slice(0, 12);
  const audiences = aggregateByUtm(rankingRows, "utm_term").slice(0, 12);

  const coverage = rows.length ? (attributedRows.length / rows.length) * 100 : 0;
  const premiumAttributed = attributedRows.filter(isPremium);
  const plusAttributed = attributedRows.filter(isPlus);
  const activePremiumAttributed = premiumAttributed.filter(isActive);
  const lastTrackedConversion = attributedRows[0]?.created_at ?? null;
  const freeTracked = attributedRows.filter((row) => normalize(planOf(row)?.slug) === "free");
  const conversionFunnel = aggregateConversionFunnel(funnelEvents).slice(0, 20);
  const totalFunnelLeads = funnelEvents.filter((row) => row.event_name === "Lead_free_signup").length;
  const totalFunnelLogins = funnelEvents.filter((row) => row.event_name === "CompleteRegistration_first_login").length;
  const totalFunnelCheckouts = funnelEvents.filter((row) => row.event_name === "InitiateCheckout_premium").length;
  const totalFunnelPurchases = funnelEvents.filter((row) => row.event_name === "Purchase_premium").length;
  const averageLeadToPremium = ratioPercent(totalFunnelPurchases, totalFunnelLeads);
  const lastFunnelEvent = funnelEvents[0]?.created_at ?? null;

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-zinc-950 via-zinc-950 to-cyan-950/40 p-6 shadow-2xl shadow-black/30 sm:p-8">
        <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-100">
              <Sparkles className="h-3.5 w-3.5" /> Premium · Marketing
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Campanhas Meta</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Acompanhe campanhas, criativos, assinantes e receita atribuída por UTM.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
            Fonte: <span className="font-medium text-white">subscriptions</span> + profiles/plans
          </div>
        </div>
      </header>

      {errorMessage ? <DiagnosticAlert tone="rose" title="Falha ao carregar subscriptions" description={errorMessage} /> : null}
      {fallbackMessage ? <DiagnosticAlert tone="amber" title="Relacionamento carregado por fallback" description="A consulta relacional profiles/plans falhou, então o painel buscou assinaturas, perfis e planos separadamente para continuar carregando." /> : null}
      {funnelErrorMessage ? <DiagnosticAlert tone="amber" title="Funil pronto para leitura futura" description="A tabela meta_funnel_events ainda não está disponível neste ambiente ou a migration não foi aplicada. O dashboard existente continua usando subscriptions normalmente." /> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard title="Taxa média Lead → Premium" value={formatPercent(averageLeadToPremium)} caption={`${formatNumber(totalFunnelPurchases)} compras premium / ${formatNumber(totalFunnelLeads)} leads`} tone="rose" icon={Trophy} />
        <MetricCard title="Assinaturas rastreadas" value={formatNumber(attributedRows.length)} caption={`${formatNumber(rows.length)} assinaturas analisadas`} tone="cyan" icon={Users} />
        <MetricCard title="Premium atribuídos" value={formatNumber(premiumAttributed.length)} caption={`${formatNumber(activePremiumAttributed.length)} premium ativos`} tone="violet" icon={Sparkles} />
        <MetricCard title="Plus atribuídos" value={formatNumber(plusAttributed.length)} caption="Assinantes Plus com UTM/fbclid/gclid" tone="emerald" icon={BadgeCheck} />
        <MetricCard title="MRR estimado" value={formatCurrency(mrrOf(attributedRows))} caption="Planos ativos com preço do banco ou fallback" tone="emerald" icon={TrendingUp} />
        <MetricCard title="Cobertura UTM" value={formatPercent(coverage)} caption="Percentual de assinaturas com rastreamento" tone={coverage < 50 ? "amber" : "cyan"} icon={Target} />
        <MetricCard title="Última conversão rastreada" value={formatDate(lastTrackedConversion) } caption="Criada em subscriptions.created_at" tone="violet" icon={MousePointerClick} />
      </section>

      <SectionCard eyebrow="Fase 2 · Funil de Conversão" title="Funil de Conversão por campanha" description="Eventos Meta agrupados por utm_campaign e ordenados por Purchase_premium.">
        <div className="grid gap-4 border-b border-white/10 p-5 md:grid-cols-4">
          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75"><Users className="h-4 w-4" /> Leads</div>
            <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(totalFunnelLeads)}</p>
          </div>
          <div className="rounded-2xl border border-violet-400/15 bg-violet-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/75"><LogIn className="h-4 w-4" /> Logins</div>
            <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(totalFunnelLogins)}</p>
          </div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/75"><ShoppingCart className="h-4 w-4" /> Checkouts</div>
            <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(totalFunnelCheckouts)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/75"><Sparkles className="h-4 w-4" /> Premium</div>
            <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(totalFunnelPurchases)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500">
              <tr>
                <th className="px-5 py-4">Campanha</th>
                <th className="px-5 py-4">Lead_free_signup</th>
                <th className="px-5 py-4">CompleteRegistration_first_login</th>
                <th className="px-5 py-4">InitiateCheckout_premium</th>
                <th className="px-5 py-4">Purchase_premium</th>
                <th className="px-5 py-4">Lead → Login %</th>
                <th className="px-5 py-4">Login → Checkout %</th>
                <th className="px-5 py-4">Checkout → Premium %</th>
                <th className="px-5 py-4">Último evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {conversionFunnel.map((campaign) => (
                <tr key={campaign.key} className="text-zinc-300 transition hover:bg-white/[0.03]">
                  <td className="max-w-[300px] px-5 py-4"><span className="block truncate font-medium text-white">{campaign.campaign}</span></td>
                  <td className="px-5 py-4">{formatNumber(campaign.lead)}</td>
                  <td className="px-5 py-4 text-violet-100">{formatNumber(campaign.login)}</td>
                  <td className="px-5 py-4 text-amber-100">{formatNumber(campaign.checkout)}</td>
                  <td className="px-5 py-4 font-semibold text-emerald-100">{formatNumber(campaign.purchase)}</td>
                  <td className="px-5 py-4">{formatPercent(campaign.leadToLogin)}</td>
                  <td className="px-5 py-4">{formatPercent(campaign.loginToCheckout)}</td>
                  <td className="px-5 py-4">{formatPercent(campaign.checkoutToPremium)}</td>
                  <td className="px-5 py-4 text-zinc-500">{formatDate(campaign.lastAt, true)}</td>
                </tr>
              ))}
              {!conversionFunnel.length ? <EmptyRow colSpan={9} message="Nenhum evento de funil armazenado ainda. A migration cria a estrutura meta_funnel_events para leitura futura sem interromper o dashboard atual." /> : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-zinc-500">
          Último evento de funil: <span className="text-zinc-300">{formatDate(lastFunnelEvent, true)}</span>. Eventos lidos: Lead_free_signup, CompleteRegistration_first_login, InitiateCheckout_premium e Purchase_premium.
        </div>
      </SectionCard>

      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <SectionCard eyebrow="Ranking por campanha" title="Campanhas com maior receita atribuída" description="Agrupamento por utm_source + utm_medium + utm_campaign.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500">
                <tr>
                  <th className="px-5 py-4">Campanha</th>
                  <th className="px-5 py-4">Origem</th>
                  <th className="px-5 py-4">Meio</th>
                  <th className="px-5 py-4">Assinantes totais</th>
                  <th className="px-5 py-4">Ativos</th>
                  <th className="px-5 py-4">Plus</th>
                  <th className="px-5 py-4">Premium</th>
                  <th className="px-5 py-4">MRR estimado</th>
                  <th className="px-5 py-4">Última conversão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {campaigns.map((campaign) => (
                  <tr key={campaign.key} className="text-zinc-300 transition hover:bg-white/[0.03]">
                    <td className="max-w-[280px] px-5 py-4"><span className="block truncate font-medium text-white">{campaign.campaign}</span></td>
                    <td className="px-5 py-4">{campaign.source}</td>
                    <td className="px-5 py-4 text-zinc-400">{campaign.medium}</td>
                    <td className="px-5 py-4">{formatNumber(campaign.subscribers)}</td>
                    <td className="px-5 py-4">{formatNumber(campaign.active)}</td>
                    <td className="px-5 py-4">{formatNumber(campaign.plus)}</td>
                    <td className="px-5 py-4 text-violet-100">{formatNumber(campaign.premium)}</td>
                    <td className="px-5 py-4 font-medium text-emerald-100">{formatCurrency(campaign.mrr)}</td>
                    <td className="px-5 py-4 text-zinc-500">{formatDate(campaign.lastAt)}</td>
                  </tr>
                ))}
                {!campaigns.length ? <EmptyRow colSpan={9} message="Nenhuma campanha rastreada por UTM ainda." /> : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-5 shadow-2xl shadow-black/20">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/70">Funil visual simples</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Assinaturas rastreadas</h2>
            <div className="mt-5 space-y-3">
              {[
                ["Assinaturas Free rastreadas", freeTracked.length, "bg-zinc-500"],
                ["Plus rastreadas", plusAttributed.length, "bg-cyan-400"],
                ["Premium rastreadas", premiumAttributed.length, "bg-violet-400"],
                ["Premium ativos", activePremiumAttributed.length, "bg-emerald-400"],
              ].map(([label, value, color]) => (
                <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-zinc-300">{label}</span>
                    <span className="font-semibold text-white">{formatNumber(Number(value))}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, attributedRows.length ? (Number(value) / attributedRows.length) * 100 : 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-5 shadow-2xl shadow-black/20">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Diagnóstico</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Qualidade da atribuição</h2>
            <div className="mt-5 space-y-3">
              {!attributedRows.length ? <DiagnosticAlert tone="amber" title="Nenhuma UTM encontrada ainda" description="Quando assinaturas chegarem com UTM, fbclid ou gclid, os rankings serão preenchidos automaticamente." /> : null}
              {metaRows.length ? <DiagnosticAlert tone="emerald" title="Campanhas com origem Meta detectadas" description="Há assinaturas com utm_source contendo facebook, instagram ou meta, ou com fbclid capturado." /> : null}
              {coverage < 50 ? <DiagnosticAlert tone="amber" title="Cobertura UTM baixa" description="Menos de 50% das assinaturas analisadas possuem UTM, fbclid ou gclid. Revise URLs dos anúncios e checkout." /> : null}
              {attributedRows.length && coverage >= 50 ? <DiagnosticAlert tone="cyan" title="Cobertura UTM saudável" description="A maior parte das assinaturas analisadas já possui rastreamento de campanha." /> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <SectionCard eyebrow="Ranking por criativo" title="Criativos que mais converteram" description="Agrupamento por utm_content.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500">
                <tr>
                  <th className="px-5 py-4">Criativo</th>
                  <th className="px-5 py-4">Campanha</th>
                  <th className="px-5 py-4">Assinantes</th>
                  <th className="px-5 py-4">Premium</th>
                  <th className="px-5 py-4">MRR estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {creatives.map((creative) => (
                  <tr key={creative.key} className="text-zinc-300 transition hover:bg-white/[0.03]">
                    <td className="max-w-[260px] px-5 py-4"><span className="block truncate font-medium text-white">{creative.label}</span></td>
                    <td className="max-w-[240px] px-5 py-4"><span className="block truncate text-zinc-400">{creative.campaign}</span></td>
                    <td className="px-5 py-4">{formatNumber(creative.subscribers)}</td>
                    <td className="px-5 py-4 text-violet-100">{formatNumber(creative.premium)}</td>
                    <td className="px-5 py-4 font-medium text-emerald-100">{formatCurrency(creative.mrr)}</td>
                  </tr>
                ))}
                {!creatives.length ? <EmptyRow colSpan={5} message="Nenhum criativo rastreado por utm_content ainda." /> : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard eyebrow="Ranking por público/conjunto" title="Públicos com melhor atribuição" description="Agrupamento por utm_term.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500">
                <tr>
                  <th className="px-5 py-4">Público/conjunto</th>
                  <th className="px-5 py-4">Campanha</th>
                  <th className="px-5 py-4">Assinantes</th>
                  <th className="px-5 py-4">Premium</th>
                  <th className="px-5 py-4">MRR estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {audiences.map((audience) => (
                  <tr key={audience.key} className="text-zinc-300 transition hover:bg-white/[0.03]">
                    <td className="max-w-[260px] px-5 py-4"><span className="block truncate font-medium text-white">{audience.label}</span></td>
                    <td className="max-w-[240px] px-5 py-4"><span className="block truncate text-zinc-400">{audience.campaign}</span></td>
                    <td className="px-5 py-4">{formatNumber(audience.subscribers)}</td>
                    <td className="px-5 py-4 text-violet-100">{formatNumber(audience.premium)}</td>
                    <td className="px-5 py-4 font-medium text-emerald-100">{formatCurrency(audience.mrr)}</td>
                  </tr>
                ))}
                {!audiences.length ? <EmptyRow colSpan={5} message="Nenhum público/conjunto rastreado por utm_term ainda." /> : null}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>

      <SectionCard eyebrow="Últimas conversões" title="Assinaturas recentes com atribuição" description="Dados de subscriptions enriquecidos com profiles e plans quando disponíveis.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500">
              <tr>
                <th className="px-5 py-4">Nome</th>
                <th className="px-5 py-4">Email</th>
                <th className="px-5 py-4">Plano</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Origem</th>
                <th className="px-5 py-4">Campanha</th>
                <th className="px-5 py-4">Criativo</th>
                <th className="px-5 py-4">Público</th>
                <th className="px-5 py-4">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {attributedRows.slice(0, 30).map((row) => {
                const profile = profileOf(row);
                return (
                  <tr key={row.id} className="text-zinc-300 transition hover:bg-white/[0.03]">
                    <td className="max-w-[220px] px-5 py-4"><span className="block truncate font-medium text-white">{cleanLabel(profile?.full_name)}</span></td>
                    <td className="max-w-[260px] px-5 py-4"><span className="block truncate text-zinc-400">{cleanLabel(profile?.email)}</span></td>
                    <td className="px-5 py-4">{planLabel(row)}</td>
                    <td className="px-5 py-4"><StatusBadge status={row.status} /></td>
                    <td className="px-5 py-4">{cleanLabel(row.utm_source, row.fbclid ? "facebook/fbclid" : UNKNOWN)}</td>
                    <td className="max-w-[260px] px-5 py-4"><span className="block truncate">{cleanLabel(row.utm_campaign)}</span></td>
                    <td className="max-w-[220px] px-5 py-4"><span className="block truncate text-zinc-500">{cleanLabel(row.utm_content)}</span></td>
                    <td className="max-w-[220px] px-5 py-4"><span className="block truncate text-zinc-500">{cleanLabel(row.utm_term)}</span></td>
                    <td className="px-5 py-4 text-zinc-500">{formatDate(row.created_at, true)}</td>
                  </tr>
                );
              })}
              {!attributedRows.length ? <EmptyRow colSpan={9} message="Nenhuma conversão rastreada ainda." /> : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950/80 via-zinc-950/70 to-violet-950/20 p-5 text-sm leading-6 text-zinc-400 shadow-2xl shadow-black/20">
        <div className="flex items-start gap-3">
          <BarChart3 className="mt-1 h-5 w-5 shrink-0 text-cyan-200" />
          <p>
            O MRR é estimado com <span className="text-zinc-200">plans.price_cents</span> quando disponível; caso contrário, usa os fallbacks Plus R$19,90, Premium R$39,90 e planos ministeriais R$397/R$697/R$1.297. Custos, CAC e ROAS dependem de integração futura com Meta Marketing API ou importação de investimento.
          </p>
        </div>
      </div>
    </div>
  );
}
