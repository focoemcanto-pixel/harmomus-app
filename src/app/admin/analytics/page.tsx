import Link from "next/link";

import { AnalyticsMobileEventList } from "@/components/admin/analytics-mobile-event-list";
import { PageHeader } from "@/components/admin/page-header";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
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

function formatNumber(value: number | string) {
  if (typeof value === "string") return value;
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function percent(value: number, base: number) {
  return base ? Math.round((value / base) * 100) : 0;
}

function formatDay(value?: string) {
  if (!value) return "não informado";
  const formatted = formatDateTimeBR(`${value}T00:00:00`);
  return formatted === "-" ? value : formatted.slice(0, 5);
}

function EmptyState({ label = "Ainda não há dados suficientes." }: { label?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-zinc-400">{label}</div>;
}

function MetricCard({ title, value, caption, tone = "default" }: { title: string; value: number | string; caption: string; tone?: "default" | "good" | "warn" | "danger" }) {
  const tones = {
    default: "from-cyan-500/10 via-zinc-950/70 to-violet-500/10 border-white/10",
    good: "from-emerald-500/15 via-zinc-950/70 to-cyan-500/10 border-emerald-400/20",
    warn: "from-amber-500/15 via-zinc-950/70 to-zinc-950/80 border-amber-400/20",
    danger: "from-rose-500/15 via-zinc-950/70 to-zinc-950/80 border-rose-400/20",
  };
  return (
    <article className={`min-w-[180px] overflow-hidden rounded-3xl border bg-gradient-to-br ${tones[tone]} p-4 shadow-[0_0_40px_rgba(34,211,238,0.06)] sm:p-5`}>
      <p className="truncate text-[11px] uppercase tracking-[0.18em] text-zinc-500 sm:text-xs">{title}</p>
      <p className="mt-3 truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">{typeof value === "number" ? formatNumber(value) : value}</p>
      <p className="mt-1 truncate text-xs text-zinc-500">{caption}</p>
    </article>
  );
}

function BlockList({ title, data, caption }: { title: string; data: { label: string; value: number }[]; caption?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/55 p-4 shadow-2xl shadow-black/20 sm:p-5">
      <h3 className="text-sm font-semibold text-cyan-100">{title}</h3>
      {caption ? <p className="mt-1 text-xs text-zinc-500">{caption}</p> : null}
      {data.length === 0 ? <div className="mt-4"><EmptyState /></div> : (
        <div className="mt-4 space-y-3">
          {data.map((item, index) => <div key={`${item.label}-${index}`}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate text-zinc-300">{item.label}</span><span className="shrink-0 font-medium text-zinc-100">{formatNumber(item.value)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400" style={{ width: `${Math.min(100, Math.max((item.value / max) * 100, 4))}%` }} /></div></div>)}
        </div>
      )}
    </div>
  );
}

function TrendChart({ data }: { data: { date: string; plays: number }[] }) {
  const max = Math.max(...data.map((d) => d.plays), 1);
  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/55 p-4 shadow-2xl shadow-black/20 sm:p-5 xl:col-span-2">
      <h3 className="text-base font-semibold text-white">Tendência de reproduções</h3>
      <p className="mt-1 text-sm text-zinc-500">Evolução diária no período selecionado.</p>
      {data.length === 0 ? <div className="mt-4"><EmptyState /></div> : <div className="mt-5 flex h-48 items-end gap-1.5 rounded-2xl border border-white/10 bg-black/20 p-3 sm:h-56 sm:p-4">{data.map((item) => <div key={item.date} className="group flex min-w-0 flex-1 flex-col items-center gap-2"><div className="relative flex w-full items-end justify-center"><div className="w-full rounded-t-xl bg-gradient-to-t from-violet-500 via-cyan-400 to-emerald-300 shadow-[0_0_18px_rgba(34,211,238,0.18)]" style={{ height: `${Math.max((item.plays / max) * 170, item.plays > 0 ? 10 : 2)}px` }} /></div><div className="hidden text-[10px] text-zinc-500 sm:block">{formatDay(item.date)}</div></div>)}</div>}
    </div>
  );
}

function DataTable({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/55 p-4 shadow-2xl shadow-black/20 sm:p-5"><h3 className="mb-4 truncate text-sm font-semibold text-cyan-100">{title}</h3>{children}</div>;
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const period = params.period === "7" || params.period === "30" || params.period === "90" ? params.period : "30";
  const plan = params.plan === "free" || params.plan === "plus" || params.plan === "premium" || params.plan === "all" ? params.plan : "all";
  const device = params.device === "mobile" || params.device === "desktop" || params.device === "all" ? params.device : "all";
  const filters: AnalyticsFilters = { period, plan, device, query: params.q ?? "" };

  const [summary, byDay, devices, plans, topSongs, topKits, topUsers, topTones, topVoices, recent, premiumRequests, deniedReasons, deniedKits, gatePages, recentDenied] = await Promise.all([
    getAdminAnalyticsSummary(filters),
    getPlaysByDay(filters),
    getDeviceBreakdown(filters),
    getPlanBreakdown(filters),
    getTopSongs(filters),
    getTopKits(filters),
    getTopUsers(filters),
    getTopTones(filters),
    getTopVoices(filters),
    getRecentPlays(filters),
    getPremiumRequestsSummary(filters),
    getTopDeniedReasons(filters),
    getTopDeniedKits(filters),
    getTopGatePages(filters),
    getRecentDenied(filters),
  ]);

  const estimatedMrr = summary.plusActive * 29.9 + summary.premiumActive * 49.9;
  const topPlan = [...plans].sort((a, b) => b.value - a.value)[0]?.label ?? "não informado";
  const topKit = topKits[0]?.label ?? "não informado";
  const topUser = topUsers[0]?.label ?? "não informado";
  const peakDay = [...byDay].sort((a, b) => b.plays - a.plays)[0];
  const conversionOpportunity = summary.gateViews ? `${summary.gateViews} bloqueios por ${summary.uniqueGateUsers} usuário(s)` : "sem bloqueios premium";

  return (
    <section className="min-w-0 space-y-4 overflow-hidden text-zinc-100 sm:space-y-6">
      <PageHeader title="Analytics" description="Inteligência de consumo, retenção e oportunidades comerciais da plataforma Harmomus." />

      <form className="min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/55 p-3 shadow-2xl shadow-black/20 sm:p-4">
        <div className="grid gap-2 md:grid-cols-5">
          <select name="period" defaultValue={filters.period} className="min-w-0 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select>
          <select name="plan" defaultValue={filters.plan} className="min-w-0 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"><option value="all">Todos planos</option><option value="free">Free</option><option value="plus">Plus</option><option value="premium">Premium</option></select>
          <select name="device" defaultValue={filters.device} className="min-w-0 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none"><option value="all">Todos dispositivos</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option></select>
          <input name="q" defaultValue={filters.query} placeholder="Buscar kit/música" className="min-w-0 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-600" />
          <button className="min-w-0 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/15">Aplicar filtros</button>
        </div>
      </form>

      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_32%),rgba(9,9,11,0.82)] p-4 shadow-2xl shadow-black/30 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200/70">Dashboard CEO</p>
        <h2 className="mt-1 text-xl font-semibold text-white">Simulações comerciais e sinais de crescimento</h2>
        <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-6">
          <MetricCard title="Simulação MRR" value={formatCurrency(estimatedMrr)} caption="Preço fixo no código" tone="good" />
          <MetricCard title="Assinantes" value={summary.activeSubscribers} caption={`${summary.plusActive} Plus · ${summary.premiumActive} Premium`} />
          <MetricCard title="Mix Premium" value={`${percent(summary.premiumActive, summary.activeSubscribers)}%`} caption="Premium na base" />
          <MetricCard title="Bloqueio" value={`${summary.denyRate}%`} caption="Tentativas travadas" tone={summary.denyRate > 20 ? "danger" : summary.denyRate > 0 ? "warn" : "default"} />
        </div>
      </div>

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 xl:grid-cols-5">
        <MetricCard title="Plays" value={summary.plays} caption={`${summary.avgDailyPlays} por dia`} tone="good" />
        <MetricCard title="Usuários únicos" value={summary.uniqueUsers} caption={`${summary.uniqueSessions} sessões`} />
        <MetricCard title="Bloqueios" value={summary.denied} caption={`${summary.denyRate}% de taxa`} tone={summary.denyRate > 20 ? "danger" : summary.denyRate > 0 ? "warn" : "default"} />
        <MetricCard title="Assinantes ativos" value={summary.activeSubscribers} caption={`${summary.plusActive} Plus · ${summary.premiumActive} Premium`} />
        <MetricCard title="Premium requests" value={premiumRequests.open} caption={`${premiumRequests.total} totais`} tone={premiumRequests.open > 0 ? "warn" : "default"} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Kit em alta" value={topKit} caption="Maior consumo" tone="good" />
        <MetricCard title="Dia mais forte" value={peakDay ? `${formatDay(peakDay.date)} · ${peakDay.plays}` : "não informado"} caption="Pico do período" />
        <MetricCard title="Plano dominante" value={topPlan} caption="Mais consumo" />
        <MetricCard title="Oportunidade" value={conversionOpportunity} caption="Bloqueios premium" tone={summary.gateViews ? "warn" : "default"} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3"><TrendChart data={byDay} /><BlockList title="Dispositivos" data={devices} caption="Onde o consumo acontece." /></div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BlockList title="Reproduções por plano" data={plans} />
        <BlockList title="Top 10 músicas" data={topSongs} />
        <BlockList title="Top 10 kits" data={topKits} />
        <BlockList title="Top 10 usuários" data={topUsers} caption={`Assinante mais ativo: ${topUser}`} />
        <BlockList title="Tons mais ouvidos" data={topTones} />
        <BlockList title="Vozes/Nipes" data={topVoices} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BlockList title="Motivos de bloqueio" data={deniedReasons} />
        <BlockList title="Kits bloqueados" data={deniedKits} />
        <BlockList title="Páginas com bloqueio" data={gatePages} />
      </div>

      <DataTable title="Últimos 50 plays">
        <AnalyticsMobileEventList items={recent} emptyLabel="Nenhum play registrado no período." />
        <div className="hidden overflow-x-auto lg:block">{recent.length === 0 ? <EmptyState /> : <table className="min-w-[1100px] w-full text-xs"><thead className="text-left text-zinc-400"><tr><th className="pb-3">Quando</th><th className="pb-3">Kit</th><th className="pb-3">Música/Faixa</th><th className="pb-3">Usuário</th><th className="pb-3">Plano</th><th className="pb-3">Dispositivo</th><th className="pb-3">Tom/Voz</th><th className="pb-3">Página</th></tr></thead><tbody>{recent.map((r: any, i: number) => <tr key={`${r.when}-${i}`} className="border-t border-white/10 text-zinc-300"><td className="py-3">{r.when ? formatDateTimeBR(r.when) : "-"}</td><td className="py-3">{r.kit}</td><td className="py-3">{r.track}</td><td className="py-3">{r.user}</td><td className="py-3">{r.plan}</td><td className="py-3">{r.device}</td><td className="py-3">{r.toneVoice}</td><td className="py-3">{r.kitSlug ? <Link className="text-cyan-300 hover:text-cyan-200" href={`/biblioteca/${r.kitSlug}`}>{r.page}</Link> : r.page}</td></tr>)}</tbody></table>}</div>
      </DataTable>

      <DataTable title="Últimos bloqueios / oportunidades">
        <AnalyticsMobileEventList items={recentDenied} emptyLabel="Nenhum bloqueio registrado no período." denied />
        <div className="hidden overflow-x-auto lg:block">{recentDenied.length === 0 ? <EmptyState label="Nenhum bloqueio registrado no período." /> : <table className="min-w-[1100px] w-full text-xs"><thead className="text-left text-zinc-400"><tr><th className="pb-3">Quando</th><th className="pb-3">Kit</th><th className="pb-3">Música/Faixa</th><th className="pb-3">Usuário</th><th className="pb-3">Plano</th><th className="pb-3">Dispositivo</th><th className="pb-3">Motivo</th><th className="pb-3">Página</th></tr></thead><tbody>{recentDenied.map((r: any, i: number) => <tr key={`${r.when}-${i}`} className="border-t border-white/10 text-zinc-300"><td className="py-3">{r.when ? formatDateTimeBR(r.when) : "-"}</td><td className="py-3">{r.kit}</td><td className="py-3">{r.track}</td><td className="py-3">{r.user}</td><td className="py-3">{r.plan}</td><td className="py-3">{r.device}</td><td className="py-3 text-rose-200">{r.reason}</td><td className="py-3">{r.kitSlug ? <Link className="text-cyan-300 hover:text-cyan-200" href={`/biblioteca/${r.kitSlug}`}>{r.page}</Link> : r.page}</td></tr>)}</tbody></table>}</div>
      </DataTable>
    </section>
  );
}
