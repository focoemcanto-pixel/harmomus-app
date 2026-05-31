import Link from "next/link";
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

type ListItem = { label: string; value: number };

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
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{formatNumber(value)}</p>
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
  const conversionOpportunity = summary.gateViews ? `${summary.gateViews} visualizações de bloqueio premium por ${summary.uniqueGateUsers} usuário(s)` : "sem bloqueios premium no período";

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

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard title="Plays" value={summary.plays} caption={`${summary.avgDailyPlays} por dia`} tone="good" />
      <MetricCard title="Usuários únicos" value={summary.uniqueUsers} caption={`${summary.uniqueSessions} sessões únicas`} />
      <MetricCard title="Bloqueios" value={summary.denied} caption={`${summary.denyRate}% de taxa`} tone={summary.denyRate > 20 ? "danger" : summary.denyRate > 0 ? "warn" : "default"} />
      <MetricCard title="Assinantes ativos" value={summary.activeSubscribers} caption={`${summary.plusActive} Plus · ${summary.premiumActive} Premium/Minist.`} />
      <MetricCard title="Premium requests" value={premiumRequests.open} caption={`${premiumRequests.total} solicitações totais`} tone={premiumRequests.open > 0 ? "warn" : "default"} />
    </div>

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
  </section>;
}
