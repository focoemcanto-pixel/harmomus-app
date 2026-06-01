import Link from "next/link";
import type React from "react";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { PageHeader } from "@/components/admin/page-header";
import {
  getAdminAnalyticsSummary,
  getDeviceBreakdown,
  getPlanBreakdown,
  getPlaysByDay,
  getPremiumRequestsSummary,
  getRecentDenied,
  getRecentPlays,
  getTopDeniedKits,
  getTopDeniedReasons,
  getTopGatePages,
  getTopKits,
  getTopSongs,
  getTopTones,
  getTopUsers,
  getTopVoices,
  type AnalyticsFilters,
} from "@/lib/data/admin-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PLAN_PRICE_ESTIMATE = {
  plus: 29.9,
  premium: 49.9,
  ministry: 149.9,
} as const;

type ListItem = { label: string; value: number };
type FunnelStep = { label: string; value: number; caption: string };
type Opportunity = { label: string; value: number; usersHint?: string; kind: "high" | "medium" | "low" };
type Insight = { title: string; body: string; tone: "emerald" | "cyan" | "violet" | "rose" | "amber" };
type CeoMetric = { title: string; value: string | number; caption: string; tone?: "default" | "good" | "warn" | "danger" };

function EmptyState({ label = "Ainda não há dados suficientes." }: { label?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">{label}</div>;
}

function formatDay(value?: string) {
  if (!value) return "não informado";
  const formatted = formatDateTimeBR(`${value}T00:00:00`);
  return formatted === "-" ? value : formatted.slice(0, 5);
}

function formatNumber(value: number | string) {
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function percent(value: number, base: number) {
  if (!base) return 0;
  return Math.round((value / base) * 100);
}

function potentialLabel(kind: Opportunity["kind"]) {
  if (kind === "high") return "🔥 Alto";
  if (kind === "medium") return "🟡 Médio";
  return "Baixo";
}

function MetricCard({ title, value, caption, tone = "default" }: { title: string; value: number | string; caption: string; tone?: "default" | "good" | "warn" | "danger" }) {
  const tones = {
    default: "from-cyan-500/10 via-zinc-950/70 to-violet-500/10 border-white/10",
    good: "from-emerald-500/15 via-zinc-950/70 to-cyan-500/10 border-emerald-400/20",
    warn: "from-amber-500/15 via-zinc-950/70 to-zinc-950/80 border-amber-400/20",
    danger: "from-rose-500/15 via-zinc-950/70 to-zinc-950/80 border-rose-400/20",
  };
  return (
    <div className={`rounded-3xl border bg-gradient-to-br ${tones[tone]} p-5 shadow-[0_0_40px_rgba(34,211,238,0.06)]`}>
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{title}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{typeof value === "number" ? formatNumber(value) : value}</p>
      <p className="mt-1 text-xs text-zinc-500">{caption}</p>
    </div>
  );
}

function BlockList({ title, data, caption }: { title: string; data: ListItem[]; caption?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950/55 p-5 shadow-2xl shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-cyan-100">{title}</h3>
          {caption ? <p className="mt-1 text-xs text-zinc-500">{caption}</p> : null}
        </div>
      </div>
      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {data.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <div className="mb-1.5 flex justify-between gap-3 text-xs">
                <span className="truncate text-zinc-300">{item.label}</span>
                <span className="font-medium text-zinc-100">{formatNumber(item.value)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400" style={{ width: `${Math.max((item.value / max) * 100, 4)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; plays: number }[] }) {
  const max = Math.max(...data.map((d) => d.plays), 1);
  const last = data[data.length - 1]?.plays ?? 0;
  const previous = data[data.length - 2]?.plays ?? 0;
  const trend = previous ? Math.round(((last - previous) / previous) * 100) : 0;
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950/55 p-5 shadow-2xl shadow-black/20 xl:col-span-2">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Tendência de reproduções</h3>
          <p className="mt-1 text-sm text-zinc-500">Evolução diária no período selecionado.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${trend >= 0 ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-rose-400/30 bg-rose-500/10 text-rose-200"}`}>{trend >= 0 ? "+" : ""}{trend}% vs dia anterior</span>
      </div>
      {data.length === 0 ? <EmptyState /> : (
        <div className="flex h-56 items-end gap-1.5 rounded-2xl border border-white/10 bg-black/20 p-4">
          {data.map((item) => (
            <div key={item.date} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
              <div className="relative flex w-full items-end justify-center">
                <div className="w-full rounded-t-xl bg-gradient-to-t from-violet-500 via-cyan-400 to-emerald-300 shadow-[0_0_18px_rgba(34,211,238,0.18)] transition group-hover:opacity-80" style={{ height: `${Math.max((item.plays / max) * 185, item.plays > 0 ? 10 : 2)}px` }} />
              </div>
              <div className="hidden text-[10px] text-zinc-500 sm:block">{formatDay(item.date)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CeoDashboard({ metrics }: { metrics: CeoMetric[] }) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_32%),rgba(9,9,11,0.82)] p-5 shadow-2xl shadow-black/30">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200/70">Dashboard CEO</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Receita, crescimento e potencial</h2>
        <p className="mt-1 text-sm text-zinc-500">Estimativas baseadas nos planos ativos e sinais comerciais disponíveis hoje.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => <MetricCard key={metric.title} title={metric.title} value={metric.value} caption={metric.caption} tone={metric.tone} />)}
      </div>
    </div>
  );
}

function FunnelCard({ steps }: { steps: FunnelStep[] }) {
  const base = Math.max(steps[0]?.value ?? 0, 1);
  return (
    <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_35%),rgba(9,9,11,0.72)] p-5 shadow-2xl shadow-black/20 xl:col-span-3">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Crescimento</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Funil Harmomus</h3>
          <p className="mt-1 text-sm text-zinc-500">Leitura executiva com as métricas disponíveis hoje. Conversões financeiras reais entram quando adicionarmos eventos de checkout/assinatura ao analytics.</p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        {steps.map((step, index) => {
          const width = Math.max(percent(step.value, base), step.value > 0 ? 8 : 2);
          const prev = index > 0 ? steps[index - 1]?.value ?? 0 : step.value;
          const localRate = index === 0 ? 100 : percent(step.value, prev);
          return (
            <div key={step.label} className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-zinc-500">Etapa {index + 1}</p>
                  <h4 className="mt-1 text-sm font-semibold text-white">{step.label}</h4>
                </div>
                <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-100">{localRate}%</span>
              </div>
              <p className="mt-4 text-3xl font-semibold text-white">{formatNumber(step.value)}</p>
              <p className="mt-1 min-h-8 text-xs text-zinc-500">{step.caption}</p>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AutomatedInsights({ insights }: { insights: Insight[] }) {
  const tones = {
    emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    cyan: "border-cyan-400/20 bg-cyan-500/10 text-cyan-100",
    violet: "border-violet-400/20 bg-violet-500/10 text-violet-100",
    rose: "border-rose-400/20 bg-rose-500/10 text-rose-100",
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-100",
  };
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950/55 p-5 shadow-2xl shadow-black/20">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/70">Intelligence</p>
        <h3 className="mt-1 text-lg font-semibold text-white">Insights automáticos</h3>
        <p className="mt-1 text-sm text-zinc-500">Leituras geradas a partir dos dados atuais, sem depender de eventos novos.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight) => (
          <article key={insight.title} className={`rounded-3xl border p-4 ${tones[insight.tone]}`}>
            <p className="text-sm font-semibold text-white">{insight.title}</p>
            <p className="mt-2 text-xs leading-relaxed opacity-80">{insight.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function OpportunityCenter({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,0.10),transparent_34%),rgba(9,9,11,0.72)] p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-200/70">Receita</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Centro de Oportunidades</h3>
          <p className="mt-1 text-sm text-zinc-500">Kits que mais geram desejo travado. Priorize campanhas, novos tons e chamadas para upgrade.</p>
        </div>
      </div>
      {opportunities.length === 0 ? <EmptyState label="Nenhuma oportunidade de bloqueio encontrada no período." /> : (
        <div className="grid gap-3 lg:grid-cols-3">
          {opportunities.map((item) => (
            <article key={item.label} className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-white">{item.label}</h4>
                  <p className="mt-1 text-xs text-zinc-500">{item.usersHint ?? "Usuários únicos ainda não disponíveis para este recorte."}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] ${item.kind === "high" ? "border border-rose-400/30 bg-rose-500/10 text-rose-100" : item.kind === "medium" ? "border border-amber-400/30 bg-amber-500/10 text-amber-100" : "border border-white/10 bg-white/[0.03] text-zinc-300"}`}>{potentialLabel(item.kind)}</span>
              </div>
              <p className="mt-5 text-3xl font-semibold text-white">{formatNumber(item.value)}</p>
              <p className="mt-1 text-xs text-zinc-500">bloqueios no período</p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-xs text-zinc-400">Ação sugerida: campanha de upgrade ou liberar prévia estratégica deste kit.</div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function FutureMetricsRoadmap() {
  const items = [
    "Churn real por cancelamento e período",
    "Conversão Free → Plus → Premium",
    "LTV e receita por cohort",
    "Tempo médio de escuta e conclusão de faixa",
    "Usuários em risco por inatividade",
    "Kits que mais convertem assinatura",
  ];
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">Próximas métricas</p>
      <h3 className="mt-1 text-lg font-semibold text-white">Dados que dependem de novos eventos</h3>
      <p className="mt-1 text-sm text-zinc-500">Esses indicadores foram planejados, mas não devem ser estimados sem rastreamento próprio para evitar decisões em cima de número falso.</p>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">{item}</div>)}
      </div>
    </div>
  );
}

function InsightCard({ label, value, tone = "cyan" }: { label: string; value: string; tone?: "cyan" | "emerald" | "violet" | "rose" }) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-500/5 text-cyan-100",
    emerald: "border-emerald-300/20 bg-emerald-500/5 text-emerald-100",
    violet: "border-violet-300/20 bg-violet-500/5 text-violet-100",
    rose: "border-rose-300/20 bg-rose-500/5 text-rose-100",
  };
  return <div className={`rounded-3xl border ${tones[tone]} p-5 text-sm`}><p className="text-xs uppercase tracking-[0.18em] opacity-60">{label}</p><p className="mt-2 font-semibold text-white">{value}</p></div>;
}

function DataTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-zinc-950/55 p-5 shadow-2xl shadow-black/20">
      <h3 className="mb-4 text-sm font-semibold text-cyan-100">{title}</h3>
      {children}
    </div>
  );
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const filters: AnalyticsFilters = { period: (params.period as any) ?? "30", plan: (params.plan as any) ?? "all", device: (params.device as any) ?? "all", query: params.q ?? "" };

  const [summary, byDay, devices, plans, topSongs, topKits, topUsers, topTones, topVoices, recent, premiumRequests, deniedReasons, deniedKits, gatePages, recentDenied] = await Promise.all([
    getAdminAnalyticsSummary(filters), getPlaysByDay(filters), getDeviceBreakdown(filters), getPlanBreakdown(filters), getTopSongs(filters), getTopKits(filters), getTopUsers(filters), getTopTones(filters), getTopVoices(filters), getRecentPlays(filters), getPremiumRequestsSummary(filters), getTopDeniedReasons(filters), getTopDeniedKits(filters), getTopGatePages(filters), getRecentDenied(filters),
  ]);

  const peakDay = [...byDay].sort((a, b) => b.plays - a.plays)[0];
  const topPlan = [...plans].sort((a, b) => b.value - a.value)[0]?.label ?? "não informado";
  const topKit = topKits[0]?.label ?? "não informado";
  const topUser = topUsers[0]?.label ?? "não informado";
  const estimatedMrr = summary.plusActive * PLAN_PRICE_ESTIMATE.plus + summary.premiumActive * PLAN_PRICE_ESTIMATE.premium;
  const potentialRevenue = premiumRequests.open * PLAN_PRICE_ESTIMATE.premium;
  const opportunityRevenue = deniedKits.slice(0, 3).reduce((sum, item) => sum + item.value, 0) * 0.08 * PLAN_PRICE_ESTIMATE.premium;
  const conversionOpportunity = summary.gateViews ? `${summary.gateViews} visualizações de bloqueio premium por ${summary.uniqueGateUsers} usuário(s)` : "sem bloqueios premium no período";
  const funnelSteps: FunnelStep[] = [
    { label: "Usuários únicos", value: summary.uniqueUsers, caption: "Pessoas que consumiram áudio." },
    { label: "Sessões", value: summary.uniqueSessions, caption: "Sessões únicas de reprodução." },
    { label: "Plays", value: summary.plays, caption: "Reproduções autorizadas." },
    { label: "Bloqueios Premium", value: summary.gateViews || summary.denied, caption: "Desejo travado por plano/acesso." },
    { label: "Pedidos Premium", value: premiumRequests.open, caption: "Solicitações abertas para conversão." },
  ];
  const opportunities: Opportunity[] = deniedKits.slice(0, 6).map((item) => ({
    label: item.label,
    value: item.value,
    kind: item.value >= 20 ? "high" : item.value >= 8 ? "medium" : "low",
  }));
  const ceoMetrics: CeoMetric[] = [
    { title: "MRR estimado", value: formatCurrency(estimatedMrr), caption: "Baseado em Plus/Premium ativos", tone: "good" },
    { title: "Receita potencial", value: formatCurrency(potentialRevenue), caption: "Pedidos Premium abertos × preço Premium", tone: premiumRequests.open > 0 ? "warn" : "default" },
    { title: "Potencial bloqueado", value: formatCurrency(opportunityRevenue), caption: "Estimativa conservadora dos principais bloqueios", tone: opportunityRevenue > 0 ? "warn" : "default" },
    { title: "Assinantes", value: summary.activeSubscribers, caption: `${summary.plusActive} Plus · ${summary.premiumActive} Premium/Minist.` },
    { title: "Mix Premium", value: `${percent(summary.premiumActive, summary.activeSubscribers)}%`, caption: "Participação Premium/Ministerial na base" },
    { title: "Bloqueio", value: `${summary.denyRate}%`, caption: "Tentativas travadas no período", tone: summary.denyRate > 20 ? "danger" : summary.denyRate > 0 ? "warn" : "default" },
  ];
  const automaticInsights: Insight[] = [
    {
      title: summary.denyRate > 15 ? "Bloqueio alto" : "Bloqueio controlado",
      body: summary.denyRate > 15 ? `${summary.denyRate}% das tentativas foram bloqueadas. Isso pode indicar desejo de upgrade, mas também fricção excessiva.` : `Taxa de bloqueio em ${summary.denyRate}%. Acompanhe se isso gera pedidos Premium ou abandono.`,
      tone: summary.denyRate > 15 ? "rose" : "cyan",
    },
    {
      title: "Conteúdo com maior tração",
      body: topKit !== "não informado" ? `${topKit} lidera o consumo no período. Considere expandir tons, vozes ou criar campanha em cima dele.` : "Ainda não há kit líder suficiente para uma decisão de conteúdo.",
      tone: "emerald",
    },
    {
      title: "Plano dominante",
      body: topPlan !== "não informado" ? `${topPlan} concentra mais consumo. Use isso para avaliar se o plano está atraente ou se há gargalo para upgrade.` : "Sem distribuição de plano suficiente no período.",
      tone: "violet",
    },
    {
      title: premiumRequests.open > 0 ? "Fila comercial aberta" : "Sem fila Premium aberta",
      body: premiumRequests.open > 0 ? `${premiumRequests.open} solicitação(ões) Premium precisam de atenção. Priorize contato rápido para aumentar conversão.` : "Nenhuma solicitação Premium aberta agora. Foque em criar novos pontos de desejo no produto.",
      tone: premiumRequests.open > 0 ? "amber" : "cyan",
    },
  ];

  return <section className="space-y-6 text-zinc-100">
    <PageHeader title="Analytics" description="Inteligência de consumo, retenção e oportunidades comerciais da plataforma Harmomus." />

    <form className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4 shadow-2xl shadow-black/20">
      <div className="grid gap-3 md:grid-cols-5">
        <select name="period" defaultValue={filters.period} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select>
        <select name="plan" defaultValue={filters.plan} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"><option value="all">Todos planos</option><option value="free">Free</option><option value="plus">Plus</option><option value="premium">Premium</option></select>
        <select name="device" defaultValue={filters.device} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"><option value="all">Todos dispositivos</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option></select>
        <input name="q" defaultValue={filters.query} placeholder="Buscar kit/música" className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-600" />
        <button className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/15">Aplicar filtros</button>
      </div>
    </form>

    <CeoDashboard metrics={ceoMetrics} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard title="Plays" value={summary.plays} caption={`${summary.avgDailyPlays} por dia`} tone="good" />
      <MetricCard title="Usuários únicos" value={summary.uniqueUsers} caption={`${summary.uniqueSessions} sessões únicas`} />
      <MetricCard title="Bloqueios" value={summary.denied} caption={`${summary.denyRate}% de taxa`} tone={summary.denyRate > 20 ? "danger" : summary.denyRate > 0 ? "warn" : "default"} />
      <MetricCard title="Assinantes ativos" value={summary.activeSubscribers} caption={`${summary.plusActive} Plus · ${summary.premiumActive} Premium/Minist.`} />
      <MetricCard title="Premium requests" value={premiumRequests.open} caption={`${premiumRequests.total} solicitações totais`} tone={premiumRequests.open > 0 ? "warn" : "default"} />
    </div>

    <AutomatedInsights insights={automaticInsights} />
    <FunnelCard steps={funnelSteps} />
    <OpportunityCenter opportunities={opportunities} />

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <InsightCard label="Kit em alta" value={topKit} tone="emerald" />
      <InsightCard label="Dia mais forte" value={peakDay ? `${formatDay(peakDay.date)} · ${peakDay.plays} plays` : "não informado"} tone="cyan" />
      <InsightCard label="Plano com mais consumo" value={topPlan} tone="violet" />
      <InsightCard label="Oportunidade comercial" value={conversionOpportunity} tone={summary.gateViews ? "rose" : "cyan"} />
    </div>

    <div className="grid gap-3 xl:grid-cols-3">
      <TrendChart data={byDay} />
      <BlockList title="Dispositivos" data={devices} caption="Onde o consumo acontece." />
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <BlockList title="Reproduções por plano" data={plans} caption="Distribuição do consumo por plano." />
      <BlockList title="Top 10 músicas" data={topSongs} caption="Faixas com mais reproduções." />
      <BlockList title="Top 10 kits" data={topKits} caption="Kits mais acessados." />
      <BlockList title="Top 10 usuários" data={topUsers} caption={`Assinante mais ativo: ${topUser}`} />
      <BlockList title="Tons mais ouvidos" data={topTones} caption="Ajuda a priorizar novos kits." />
      <BlockList title="Vozes/Nipes mais ouvidos" data={topVoices} caption="Mostra o interesse por faixa/voz." />
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <BlockList title="Motivos de bloqueio" data={deniedReasons} caption="Barreiras que podem virar venda." />
      <BlockList title="Kits que mais batem no bloqueio" data={deniedKits} caption="Conteúdos com maior desejo travado." />
      <BlockList title="Páginas com mais bloqueio" data={gatePages} caption="Pontos críticos do funil." />
    </div>

    <DataTable title="Últimos 50 plays">
      {recent.length === 0 ? <EmptyState /> : <table className="min-w-[1100px] w-full text-xs"><thead className="text-left text-zinc-400"><tr><th className="pb-3">Quando</th><th className="pb-3">Kit</th><th className="pb-3">Música/Faixa</th><th className="pb-3">Usuário</th><th className="pb-3">Plano</th><th className="pb-3">Dispositivo</th><th className="pb-3">Tom/Voz</th><th className="pb-3">Página/Abrir kit</th></tr></thead><tbody>{recent.map((r, i) => <tr key={`${r.when}-${i}`} className="border-t border-white/10 text-zinc-300"><td className="py-3">{r.when ? formatDateTimeBR(r.when) : "-"}</td><td className="py-3">{r.kit}</td><td className="py-3">{r.track}</td><td className="py-3">{r.user}</td><td className="py-3"><span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">{r.plan}</span></td><td className="py-3">{r.device}</td><td className="py-3">{r.toneVoice}</td><td className="py-3">{r.kitSlug ? <Link className="text-cyan-300 hover:text-cyan-200" href={`/biblioteca/${r.kitSlug}`}>{r.page}</Link> : r.page}</td></tr>)}</tbody></table>}
    </DataTable>

    <DataTable title="Últimos bloqueios / oportunidades de conversão">
      {recentDenied.length === 0 ? <EmptyState label="Nenhum bloqueio registrado no período." /> : <table className="min-w-[1100px] w-full text-xs"><thead className="text-left text-zinc-400"><tr><th className="pb-3">Quando</th><th className="pb-3">Kit</th><th className="pb-3">Música/Faixa</th><th className="pb-3">Usuário</th><th className="pb-3">Plano</th><th className="pb-3">Dispositivo</th><th className="pb-3">Motivo</th><th className="pb-3">Página/Abrir kit</th></tr></thead><tbody>{recentDenied.map((r, i) => <tr key={`${r.when}-${i}`} className="border-t border-white/10 text-zinc-300"><td className="py-3">{r.when ? formatDateTimeBR(r.when) : "-"}</td><td className="py-3">{r.kit}</td><td className="py-3">{r.track}</td><td className="py-3">{r.user}</td><td className="py-3"><span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">{r.plan}</span></td><td className="py-3">{r.device}</td><td className="py-3 text-rose-200">{r.reason}</td><td className="py-3">{r.kitSlug ? <Link className="text-cyan-300 hover:text-cyan-200" href={`/biblioteca/${r.kitSlug}`}>{r.page}</Link> : r.page}</td></tr>)}</tbody></table>}
    </DataTable>

    <FutureMetricsRoadmap />
  </section>;
}
