import type { ReactNode } from "react";
import { AlertTriangle, BadgeCheck, BarChart3, LogIn, MousePointerClick, ShoppingCart, Sparkles, Target, TrendingUp, Trophy, Users } from "lucide-react";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UNKNOWN = "Não identificado";
const FUNNEL_EVENTS = ["Lead_free_signup", "CompleteRegistration_email_confirmed", "CompleteRegistration_first_login", "InitiateCheckout_premium", "Purchase_premium"] as const;
const ACTIVATION_EVENTS = new Set(["CompleteRegistration_email_confirmed", "CompleteRegistration_first_login"]);
const TEST_PATTERNS = ["teste", "test_", "diagnostico", "diagnostic"];

type MetaFunnelEventRow = {
  id: string;
  event_name?: string | null;
  event_id?: string | null;
  user_id?: string | null;
  anonymous_id?: string | null;
  event_source_url?: string | null;
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

type RankedEventGroup = {
  key: string;
  label: string;
  campaign: string;
  source: string;
  medium: string;
  lead: number;
  activation: number;
  checkout: number;
  purchase: number;
  revenue: number;
  lastAt: string | null;
};

type ConversionFunnelGroup = {
  key: string;
  campaign: string;
  lead: number;
  activation: number;
  checkout: number;
  purchase: number;
  revenue: number;
  leadToActivation: number;
  activationToCheckout: number;
  checkoutToPremium: number;
  leadToPremium: number;
  lastAt: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanLabel(value?: string | null, fallback = UNKNOWN) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function payloadText(row: MetaFunnelEventRow, key: string) {
  const value = row.payload?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function payloadNumber(row: MetaFunnelEventRow, key: string) {
  const value = row.payload?.[key];
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function getSource(row: MetaFunnelEventRow) {
  return cleanLabel(row.utm_source ?? payloadText(row, "utm_source"));
}

function getMedium(row: MetaFunnelEventRow) {
  return cleanLabel(row.utm_medium ?? payloadText(row, "utm_medium"));
}

function getCampaign(row: MetaFunnelEventRow) {
  return cleanLabel(row.utm_campaign ?? payloadText(row, "utm_campaign"));
}

function getCreative(row: MetaFunnelEventRow) {
  return cleanLabel(row.utm_content ?? payloadText(row, "utm_content"));
}

function getPlacement(row: MetaFunnelEventRow) {
  return cleanLabel(row.utm_term ?? payloadText(row, "utm_term"));
}

function getAttributionLabel(row: MetaFunnelEventRow, field: "utm_content" | "utm_medium" | "utm_term") {
  if (field === "utm_content") return getCreative(row);
  if (field === "utm_medium") return getMedium(row);
  return getPlacement(row);
}

function isTestCampaign(value?: string | null) {
  const v = String(value || "").toLowerCase().trim();

  if (!v) return true;
  if (v === "não identificado") return true;
  if (v.includes("{{")) return true;

  return TEST_PATTERNS.some((p) => v.includes(p));
}

function hasEventAttribution(row: MetaFunnelEventRow) {
  return Boolean(
    row.utm_source ||
      row.utm_medium ||
      row.utm_campaign ||
      row.utm_content ||
      row.utm_term ||
      row.fbclid ||
      row.gclid ||
      payloadText(row, "utm_source") ||
      payloadText(row, "utm_campaign") ||
      payloadText(row, "fbclid"),
  );
}

function isMetaAttributed(row: MetaFunnelEventRow) {
  const source = normalize(getSource(row));
  return source.includes("facebook") || source.includes("instagram") || source.includes("meta") || Boolean(row.fbclid || payloadText(row, "fbclid"));
}

function isActivationEvent(eventName?: string | null) {
  return ACTIVATION_EVENTS.has(String(eventName ?? ""));
}

function purchaseValue(row: MetaFunnelEventRow) {
  if (row.event_name !== "Purchase_premium") return 0;
  const value = payloadNumber(row, "value");
  return value > 0 ? value : 39.9;
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

function applyEventToGroup<T extends { lead: number; activation: number; checkout: number; purchase: number; revenue: number; lastAt: string | null }>(group: T, row: MetaFunnelEventRow) {
  const eventName = row.event_name;

  if (eventName === "Lead_free_signup") group.lead += 1;
  if (isActivationEvent(eventName)) group.activation += 1;
  if (eventName === "InitiateCheckout_premium") group.checkout += 1;
  if (eventName === "Purchase_premium") {
    group.purchase += 1;
    group.revenue += purchaseValue(row);
  }
  if (!group.lastAt || (row.created_at && row.created_at > group.lastAt)) group.lastAt = row.created_at ?? group.lastAt;
}

function sortEventRankings(items: RankedEventGroup[]) {
  return items.sort((a, b) => b.revenue - a.revenue || b.purchase - a.purchase || b.checkout - a.checkout || b.lead - a.lead || a.label.localeCompare(b.label));
}

function aggregateCampaigns(events: MetaFunnelEventRow[]) {
  const map = new Map<string, RankedEventGroup>();

  for (const row of events) {
    const source = getSource(row);
    const medium = getMedium(row);
    const campaign = getCampaign(row);
    const key = `${normalize(source)}::${normalize(medium)}::${normalize(campaign)}`;
    const current = map.get(key) ?? { key, label: campaign, campaign, source, medium, lead: 0, activation: 0, checkout: 0, purchase: 0, revenue: 0, lastAt: null };

    applyEventToGroup(current, row);
    map.set(key, current);
  }

  return sortEventRankings(Array.from(map.values()));
}

function aggregateByUtm(events: MetaFunnelEventRow[], field: "utm_content" | "utm_medium" | "utm_term") {
  const map = new Map<string, RankedEventGroup>();

  for (const row of events) {
    const label = getAttributionLabel(row, field);
    const campaign = getCampaign(row);
    const source = getSource(row);
    const medium = getMedium(row);
    const key = `${normalize(label)}::${normalize(campaign)}`;
    const current = map.get(key) ?? { key, label, campaign, source, medium, lead: 0, activation: 0, checkout: 0, purchase: 0, revenue: 0, lastAt: null };

    applyEventToGroup(current, row);
    map.set(key, current);
  }

  return sortEventRankings(Array.from(map.values()));
}

function aggregateConversionFunnel(events: MetaFunnelEventRow[]) {
  const map = new Map<string, Omit<ConversionFunnelGroup, "leadToActivation" | "activationToCheckout" | "checkoutToPremium" | "leadToPremium">>();

  for (const row of events) {
    const campaign = getCampaign(row);
    const key = normalize(campaign);
    const current = map.get(key) ?? { key, campaign, lead: 0, activation: 0, checkout: 0, purchase: 0, revenue: 0, lastAt: null };

    applyEventToGroup(current, row);
    map.set(key, current);
  }

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      leadToActivation: ratioPercent(group.activation, group.lead),
      activationToCheckout: ratioPercent(group.checkout, group.activation),
      checkoutToPremium: ratioPercent(group.purchase, group.checkout),
      leadToPremium: ratioPercent(group.purchase, group.lead),
    }))
    .sort((a, b) => b.purchase - a.purchase || b.checkout - a.checkout || b.activation - a.activation || b.lead - a.lead || a.campaign.localeCompare(b.campaign));
}

async function fetchMetaFunnelEvents() {
  const supabase = createSupabaseAdminClient() as any;
  const result = await supabase
    .from("meta_funnel_events")
    .select("id,event_name,user_id,anonymous_id,event_id,event_source_url,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,gclid,payload,created_at")
    .in("event_name", FUNNEL_EVENTS)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (result.error) return { rows: [] as MetaFunnelEventRow[], errorMessage: result.error.message as string | null };
  return { rows: (result.data ?? []) as MetaFunnelEventRow[], errorMessage: null as string | null };
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

function SectionCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children: ReactNode }) {
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

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-zinc-500">
        {message}
      </td>
    </tr>
  );
}

function RankingTable({ rows, labelTitle, emptyMessage }: { rows: RankedEventGroup[]; labelTitle: string; emptyMessage: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500">
          <tr>
            <th className="px-5 py-4">{labelTitle}</th>
            <th className="px-5 py-4">Campanha</th>
            <th className="px-5 py-4">Leads</th>
            <th className="px-5 py-4">Checkouts</th>
            <th className="px-5 py-4">Premium</th>
            <th className="px-5 py-4">Receita</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((item) => (
            <tr key={item.key} className="text-zinc-300 transition hover:bg-white/[0.03]">
              <td className="max-w-[260px] px-5 py-4"><span className="block truncate font-medium text-white">{item.label}</span></td>
              <td className="max-w-[240px] px-5 py-4"><span className="block truncate text-zinc-400">{item.campaign}</span></td>
              <td className="px-5 py-4">{formatNumber(item.lead)}</td>
              <td className="px-5 py-4 text-amber-100">{formatNumber(item.checkout)}</td>
              <td className="px-5 py-4 text-violet-100">{formatNumber(item.purchase)}</td>
              <td className="px-5 py-4 font-medium text-emerald-100">{formatCurrency(item.revenue)}</td>
            </tr>
          ))}
          {!rows.length ? <EmptyRow colSpan={6} message={emptyMessage} /> : null}
        </tbody>
      </table>
    </div>
  );
}

export default async function CampanhasMetaPage() {
  const { rows: fetchedEvents, errorMessage: funnelErrorMessage } = await fetchMetaFunnelEvents();
  const productionFunnelEvents = fetchedEvents.filter((event) => !isTestCampaign(getCampaign(event)));
  const attributedEvents = productionFunnelEvents.filter(hasEventAttribution);
  const metaEvents = attributedEvents.filter(isMetaAttributed);
  const rankingEvents = metaEvents.length ? metaEvents : attributedEvents;

  const campaigns = aggregateCampaigns(rankingEvents).slice(0, 12);
  const creatives = aggregateByUtm(rankingEvents, "utm_content").slice(0, 12);
  const audiences = aggregateByUtm(rankingEvents, "utm_medium").slice(0, 12);
  const placements = aggregateByUtm(rankingEvents, "utm_term").slice(0, 12);

  const conversionFunnel = aggregateConversionFunnel(productionFunnelEvents).slice(0, 20);
  const totalFunnelLeads = productionFunnelEvents.filter((row) => row.event_name === "Lead_free_signup").length;
  const totalFunnelActivations = productionFunnelEvents.filter((row) => isActivationEvent(row.event_name)).length;
  const totalFunnelCheckouts = productionFunnelEvents.filter((row) => row.event_name === "InitiateCheckout_premium").length;
  const totalFunnelPurchases = productionFunnelEvents.filter((row) => row.event_name === "Purchase_premium").length;
  const totalRevenue = productionFunnelEvents.reduce((total, row) => total + purchaseValue(row), 0);
  const averageLeadToPremium = ratioPercent(totalFunnelPurchases, totalFunnelLeads);
  const averageCheckoutToPremium = ratioPercent(totalFunnelPurchases, totalFunnelCheckouts);
  const coverage = productionFunnelEvents.length ? (attributedEvents.length / productionFunnelEvents.length) * 100 : 0;
  const lastFunnelEvent = productionFunnelEvents[0]?.created_at ?? null;
  const lastTrackedConversion = attributedEvents[0]?.created_at ?? null;

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
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Acompanhe campanhas, criativos, públicos, posicionamentos, leads, checkouts e vendas atribuídas por UTM.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
            Fonte atual: <span className="font-medium text-white">meta_funnel_events</span>. UTMs oficiais: <span className="font-medium text-white">source=MetaAds · medium=conjunto · campaign=campanha · term=posicionamento · content=criativo</span>
          </div>
        </div>
      </header>

      {funnelErrorMessage ? <DiagnosticAlert tone="amber" title="Funil indisponível" description="A tabela meta_funnel_events ainda não está disponível neste ambiente ou a migration não foi aplicada." /> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard title="Lead → Premium" value={formatPercent(averageLeadToPremium)} caption={`${formatNumber(totalFunnelPurchases)} compras / ${formatNumber(totalFunnelLeads)} leads`} tone="rose" icon={Trophy} />
        <MetricCard title="Checkout → Premium" value={formatPercent(averageCheckoutToPremium)} caption={`${formatNumber(totalFunnelPurchases)} compras / ${formatNumber(totalFunnelCheckouts)} checkouts`} tone="amber" icon={ShoppingCart} />
        <MetricCard title="Leads rastreados" value={formatNumber(totalFunnelLeads)} caption="Cadastros gratuitos capturados" tone="cyan" icon={Users} />
        <MetricCard title="Ativações" value={formatNumber(totalFunnelActivations)} caption="E-mails confirmados / primeiros acessos" tone="violet" icon={LogIn} />
        <MetricCard title="Receita atribuída" value={formatCurrency(totalRevenue)} caption="Soma dos Purchase_premium atribuídos" tone="emerald" icon={TrendingUp} />
        <MetricCard title="Cobertura UTM" value={formatPercent(coverage)} caption={`${formatNumber(attributedEvents.length)} de ${formatNumber(productionFunnelEvents.length)} eventos com rastreio`} tone={coverage < 50 ? "amber" : "cyan"} icon={Target} />
      </section>

      <SectionCard eyebrow="Fase 2 · Funil de Conversão" title="Funil de Conversão por campanha" description="Eventos agrupados por utm_campaign e ordenados por Purchase_premium.">
        <div className="grid gap-4 border-b border-white/10 p-5 md:grid-cols-4">
          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75"><Users className="h-4 w-4" /> Leads</div><p className="mt-2 text-2xl font-semibold text-white">{formatNumber(totalFunnelLeads)}</p></div>
          <div className="rounded-2xl border border-violet-400/15 bg-violet-500/10 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100/75"><LogIn className="h-4 w-4" /> Ativações</div><p className="mt-2 text-2xl font-semibold text-white">{formatNumber(totalFunnelActivations)}</p></div>
          <div className="rounded-2xl border border-amber-400/15 bg-amber-500/10 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/75"><ShoppingCart className="h-4 w-4" /> Checkouts</div><p className="mt-2 text-2xl font-semibold text-white">{formatNumber(totalFunnelCheckouts)}</p></div>
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100/75"><Sparkles className="h-4 w-4" /> Premium</div><p className="mt-2 text-2xl font-semibold text-white">{formatNumber(totalFunnelPurchases)}</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500"><tr><th className="px-5 py-4">Campanha</th><th className="px-5 py-4">Leads</th><th className="px-5 py-4">Ativações</th><th className="px-5 py-4">Checkouts</th><th className="px-5 py-4">Premium</th><th className="px-5 py-4">Receita</th><th className="px-5 py-4">Lead → Ativação</th><th className="px-5 py-4">Ativação → Checkout</th><th className="px-5 py-4">Checkout → Premium</th><th className="px-5 py-4">Lead → Premium</th><th className="px-5 py-4">Último evento</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {conversionFunnel.map((campaign) => (<tr key={campaign.key} className="text-zinc-300 transition hover:bg-white/[0.03]"><td className="max-w-[300px] px-5 py-4"><span className="block truncate font-medium text-white">{campaign.campaign}</span></td><td className="px-5 py-4">{formatNumber(campaign.lead)}</td><td className="px-5 py-4 text-violet-100">{formatNumber(campaign.activation)}</td><td className="px-5 py-4 text-amber-100">{formatNumber(campaign.checkout)}</td><td className="px-5 py-4 font-semibold text-emerald-100">{formatNumber(campaign.purchase)}</td><td className="px-5 py-4 font-semibold text-emerald-100">{formatCurrency(campaign.revenue)}</td><td className="px-5 py-4">{formatPercent(campaign.leadToActivation)}</td><td className="px-5 py-4">{formatPercent(campaign.activationToCheckout)}</td><td className="px-5 py-4">{formatPercent(campaign.checkoutToPremium)}</td><td className="px-5 py-4">{formatPercent(campaign.leadToPremium)}</td><td className="px-5 py-4 text-zinc-500">{formatDate(campaign.lastAt, true)}</td></tr>))}
              {!conversionFunnel.length ? <EmptyRow colSpan={11} message="Nenhum evento de funil armazenado ainda." /> : null}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-zinc-500">Último evento de funil: <span className="text-zinc-300">{formatDate(lastFunnelEvent, true)}</span>. Eventos lidos: Lead_free_signup, CompleteRegistration_email_confirmed, CompleteRegistration_first_login, InitiateCheckout_premium e Purchase_premium.</div>
      </SectionCard>

      <section className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <SectionCard eyebrow="Ranking por campanha" title="Campanhas com maior receita atribuída" description="Agrupamento por utm_source + utm_medium + utm_campaign, usando eventos de funil.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500"><tr><th className="px-5 py-4">Campanha</th><th className="px-5 py-4">Origem</th><th className="px-5 py-4">Conjunto/Público</th><th className="px-5 py-4">Leads</th><th className="px-5 py-4">Ativações</th><th className="px-5 py-4">Checkouts</th><th className="px-5 py-4">Premium</th><th className="px-5 py-4">Receita</th><th className="px-5 py-4">Último evento</th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {campaigns.map((campaign) => (<tr key={campaign.key} className="text-zinc-300 transition hover:bg-white/[0.03]"><td className="max-w-[280px] px-5 py-4"><span className="block truncate font-medium text-white">{campaign.campaign}</span></td><td className="px-5 py-4">{campaign.source}</td><td className="px-5 py-4 text-zinc-400">{campaign.medium}</td><td className="px-5 py-4">{formatNumber(campaign.lead)}</td><td className="px-5 py-4 text-violet-100">{formatNumber(campaign.activation)}</td><td className="px-5 py-4 text-amber-100">{formatNumber(campaign.checkout)}</td><td className="px-5 py-4 text-violet-100">{formatNumber(campaign.purchase)}</td><td className="px-5 py-4 font-medium text-emerald-100">{formatCurrency(campaign.revenue)}</td><td className="px-5 py-4 text-zinc-500">{formatDate(campaign.lastAt)}</td></tr>))}
                {!campaigns.length ? <EmptyRow colSpan={9} message="Nenhuma campanha rastreada por UTM ainda." /> : null}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-5 shadow-2xl shadow-black/20"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200/70">Funil visual simples</p><h2 className="mt-1 text-xl font-semibold text-white">Eventos rastreados</h2><div className="mt-5 space-y-3">{[["Leads", totalFunnelLeads, "bg-cyan-400"], ["Ativações", totalFunnelActivations, "bg-violet-400"], ["Checkouts", totalFunnelCheckouts, "bg-amber-400"], ["Premium", totalFunnelPurchases, "bg-emerald-400"]].map(([label, value, color]) => (<div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-zinc-300">{label}</span><span className="font-semibold text-white">{formatNumber(Number(value))}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, totalFunnelLeads ? (Number(value) / totalFunnelLeads) * 100 : 0)}%` }} /></div></div>))}</div></div>
          <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-5 shadow-2xl shadow-black/20"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Diagnóstico</p><h2 className="mt-1 text-xl font-semibold text-white">Qualidade da atribuição</h2><div className="mt-5 space-y-3">{!attributedEvents.length ? <DiagnosticAlert tone="amber" title="Nenhuma UTM encontrada ainda" description="Quando eventos chegarem com UTM, fbclid ou gclid, os rankings serão preenchidos automaticamente." /> : null}{metaEvents.length ? <DiagnosticAlert tone="emerald" title="Campanhas com origem Meta detectadas" description="Há eventos com utm_source contendo facebook, instagram ou meta, ou com fbclid capturado." /> : null}{coverage < 50 ? <DiagnosticAlert tone="amber" title="Cobertura UTM baixa" description="Menos de 50% dos eventos analisados possuem UTM, fbclid ou gclid. Revise URLs dos anúncios e persistência no checkout." /> : null}{attributedEvents.length && coverage >= 50 ? <DiagnosticAlert tone="cyan" title="Cobertura UTM saudável" description="A maior parte dos eventos analisados já possui rastreamento de campanha." /> : null}{!totalFunnelActivations ? <DiagnosticAlert tone="amber" title="Evento de ativação ainda zerado" description="O painel já aceita CompleteRegistration_email_confirmed, mas só novos cadastros após o deploy devem alimentar essa métrica." /> : null}</div></div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <SectionCard eyebrow="Ranking por criativo" title="Criativos que mais converteram" description="Agrupamento por utm_content usando eventos de funil."><RankingTable rows={creatives} labelTitle="Criativo" emptyMessage="Nenhum criativo rastreado por utm_content ainda." /></SectionCard>
        <SectionCard eyebrow="Ranking por público/conjunto" title="Públicos com melhor atribuição" description="Agrupamento por utm_medium conforme padrão do gestor."><RankingTable rows={audiences} labelTitle="Público/conjunto" emptyMessage="Nenhum público/conjunto rastreado por utm_medium ainda." /></SectionCard>
        <SectionCard eyebrow="Ranking por posicionamento" title="Posicionamentos com melhor atribuição" description="Agrupamento por utm_term conforme padrão do gestor."><RankingTable rows={placements} labelTitle="Posicionamento" emptyMessage="Nenhum posicionamento rastreado por utm_term ainda." /></SectionCard>
      </section>

      <SectionCard eyebrow="Últimos eventos" title="Eventos recentes com atribuição" description="Base operacional lida diretamente de meta_funnel_events.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.16em] text-zinc-500"><tr><th className="px-5 py-4">Evento</th><th className="px-5 py-4">Campanha</th><th className="px-5 py-4">Criativo</th><th className="px-5 py-4">Público/conjunto</th><th className="px-5 py-4">Posicionamento</th><th className="px-5 py-4">Origem</th><th className="px-5 py-4">Valor</th><th className="px-5 py-4">Data</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {attributedEvents.slice(0, 40).map((row) => (<tr key={row.id} className="text-zinc-300 transition hover:bg-white/[0.03]"><td className="max-w-[220px] px-5 py-4"><span className="block truncate font-medium text-white">{cleanLabel(row.event_name)}</span></td><td className="max-w-[260px] px-5 py-4"><span className="block truncate">{getCampaign(row)}</span></td><td className="max-w-[220px] px-5 py-4"><span className="block truncate text-zinc-500">{getCreative(row)}</span></td><td className="max-w-[220px] px-5 py-4"><span className="block truncate text-zinc-500">{getMedium(row)}</span></td><td className="max-w-[220px] px-5 py-4"><span className="block truncate text-zinc-500">{getPlacement(row)}</span></td><td className="px-5 py-4">{getSource(row)}</td><td className="px-5 py-4 font-medium text-emerald-100">{row.event_name === "Purchase_premium" ? formatCurrency(purchaseValue(row)) : "—"}</td><td className="px-5 py-4 text-zinc-500">{formatDate(row.created_at, true)}</td></tr>))}
              {!attributedEvents.length ? <EmptyRow colSpan={8} message="Nenhum evento rastreado por UTM ainda." /> : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-xs leading-5 text-zinc-500">
        Última conversão rastreada: <span className="text-zinc-300">{formatDate(lastTrackedConversion, true)}</span>. Os rankings agora usam eventos de funil, não assinaturas, porque a tabela subscriptions ainda não possui UTMs preenchidas.
      </div>
    </div>
  );
}
