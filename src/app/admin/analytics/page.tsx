import Link from "next/link";
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

function EmptyState() { return <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">Ainda não há dados suficientes.</div>; }
function BlockList({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return <div className="rounded-xl border border-white/10 bg-black/30 p-4"><h3 className="mb-3 text-sm font-semibold text-cyan-200">{title}</h3>{data.length===0?<EmptyState/>:<div className="space-y-2">{data.map((item)=> <div key={item.label}><div className="mb-1 flex justify-between text-xs"><span>{item.label}</span><span>{item.value}</span></div><div className="h-2 rounded bg-white/10"><div className="h-2 rounded bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400" style={{width:`${Math.max((item.value/max)*100, 4)}%`}} /></div></div>)}</div>}</div>;
}

function formatDay(value?: string) {
  if (!value) return "não informado";
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return value;
  }
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const filters: AnalyticsFilters = { period: (params.period as any) ?? "30", plan: (params.plan as any) ?? "all", device: (params.device as any) ?? "all", query: params.q ?? "" };

  const [summary, byDay, devices, plans, topSongs, topKits, topUsers, topTones, topVoices, recent, premiumRequests, deniedReasons, deniedKits, gatePages, recentDenied] = await Promise.all([
    getAdminAnalyticsSummary(filters), getPlaysByDay(filters), getDeviceBreakdown(filters), getPlanBreakdown(filters), getTopSongs(filters), getTopKits(filters), getTopUsers(filters), getTopTones(filters), getTopVoices(filters), getRecentPlays(filters), getPremiumRequestsSummary(filters), getTopDeniedReasons(filters), getTopDeniedKits(filters), getTopGatePages(filters), getRecentDenied(filters),
  ]);

  const peakDay = [...byDay].sort((a, b) => b.plays - a.plays)[0];
  const topPlan = [...plans].sort((a, b) => b.value - a.value)[0]?.label ?? "não informado";

  return <section className="space-y-6 text-zinc-100">
    <PageHeader title="Analytics" description="Inteligência de consumo real da plataforma Harmomus." />
    <form className="grid gap-3 rounded-xl border border-white/10 bg-black/40 p-4 md:grid-cols-5">
      <select name="period" defaultValue={filters.period} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2"><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select>
      <select name="plan" defaultValue={filters.plan} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2"><option value="all">Todos planos</option><option value="free">Free</option><option value="plus">Plus</option><option value="premium">Premium</option></select>
      <select name="device" defaultValue={filters.device} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2"><option value="all">Todos dispositivos</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option></select>
      <input name="q" defaultValue={filters.query} placeholder="Buscar kit/música" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2" />
      <button className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-cyan-200">Aplicar</button>
    </form>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[["Plays", summary.plays], ["Tentativas bloqueadas", summary.denied], ["Taxa de bloqueio", `${summary.denyRate}%`], ["Usuários únicos", summary.uniqueUsers], ["Sessões únicas", summary.uniqueSessions], ["Média diária", summary.avgDailyPlays], ["Assinantes ativos", summary.activeSubscribers], ["Premium ativos", summary.premiumActive], ["Plus ativos", summary.plusActive], ["Solicitações premium abertas", premiumRequests.open]].map((c) => <div key={String(c[0])} className="rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-violet-500/10 p-4 shadow-[0_0_30px_rgba(34,211,238,0.08)]"><p className="text-xs text-zinc-400">{c[0]}</p><p className="text-2xl font-semibold">{c[1]}</p></div>)}
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <BlockList title="Reproduções por plano" data={plans} />
      <BlockList title="Dispositivos" data={devices} />
      <BlockList title="Top 10 músicas" data={topSongs} />
      <BlockList title="Top 10 kits" data={topKits} />
      <BlockList title="Top 10 usuários" data={topUsers} />
      <BlockList title="Tons mais ouvidos" data={topTones} />
      <BlockList title="Vozes/Nipes mais ouvidos" data={topVoices} />
      <BlockList title="Motivos de bloqueio" data={deniedReasons} />
      <BlockList title="Kits que mais batem no bloqueio" data={deniedKits} />
      <BlockList title="Páginas com mais bloqueio" data={gatePages} />
      <BlockList title="Usuários ativos no período" data={[{ label: "Usuários com plays", value: summary.uniqueUsers }]} />
      <BlockList title="Consumo por plano ativo" data={[{ label: "Plus", value: summary.plusActive }, { label: "Premium", value: summary.premiumActive }]} />
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-4">Kit em alta: <strong>{topKits[0]?.label ?? "não informado"}</strong></div>
      <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">Dia com mais uso: <strong>{peakDay ? `${formatDay(peakDay.date)} (${peakDay.plays} plays)` : "não informado"}</strong></div>
      <div className="rounded-xl border border-violet-300/20 bg-violet-500/5 p-4">Plano com mais consumo: <strong>{topPlan}</strong></div>
      <div className="rounded-xl border border-emerald-300/20 bg-emerald-500/5 p-4">Maior motivo de bloqueio: <strong>{deniedReasons[0]?.label ?? "não informado"}</strong></div>
      <div className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 p-4">Kit com mais bloqueios: <strong>{deniedKits[0]?.label ?? "não informado"}</strong></div>
      <div className="rounded-xl border border-violet-300/20 bg-violet-500/5 p-4">Assinante mais ativo: <strong>{topUsers[0]?.label ?? "não informado"}</strong></div>
    </div>

    <div className="rounded-xl border border-white/10 bg-black/30 p-4"><h3 className="mb-3 text-sm font-semibold text-cyan-200">Reproduções por dia</h3>{byDay.length===0?<EmptyState/>:<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{byDay.map((d)=> <div key={d.date} className="rounded border border-white/10 p-2 text-xs"><p>{d.date}</p><p className="text-lg">{d.plays}</p></div>)}</div>}</div>

    <div className="rounded-xl border border-white/10 bg-black/30 p-4 overflow-x-auto">
      <h3 className="mb-3 text-sm font-semibold text-cyan-200">Últimos 50 plays</h3>
      {recent.length===0?<EmptyState/>:<table className="min-w-[1100px] w-full text-xs"><thead className="text-left text-zinc-400"><tr><th>Quando</th><th>Kit</th><th>Música/Faixa</th><th>Usuário</th><th>Plano</th><th>Dispositivo</th><th>Tom/Voz</th><th>Página/Abrir kit</th></tr></thead><tbody>{recent.map((r, i)=> <tr key={`${r.when}-${i}`} className="border-t border-white/10"><td>{r.when ? new Date(r.when).toLocaleString("pt-BR") : "-"}</td><td>{r.kit}</td><td>{r.track}</td><td>{r.user}</td><td>{r.plan}</td><td>{r.device}</td><td>{r.toneVoice}</td><td>{r.kitSlug ? <Link className="text-cyan-300" href={`/biblioteca/${r.kitSlug}`}>{r.page}</Link> : r.page}</td></tr>)}</tbody></table>}
    </div>

    <div className="rounded-xl border border-rose-400/20 bg-rose-950/20 p-4 overflow-x-auto">
      <h3 className="mb-3 text-sm font-semibold text-rose-200">Últimos bloqueios / oportunidades de conversão</h3>
      {recentDenied.length===0?<EmptyState/>:<table className="min-w-[1100px] w-full text-xs"><thead className="text-left text-zinc-400"><tr><th>Quando</th><th>Kit</th><th>Música/Faixa</th><th>Usuário</th><th>Plano</th><th>Dispositivo</th><th>Motivo</th><th>Página/Abrir kit</th></tr></thead><tbody>{recentDenied.map((r, i)=> <tr key={`${r.when}-${i}`} className="border-t border-white/10"><td>{r.when ? new Date(r.when).toLocaleString("pt-BR") : "-"}</td><td>{r.kit}</td><td>{r.track}</td><td>{r.user}</td><td>{r.plan}</td><td>{r.device}</td><td>{r.reason}</td><td>{r.kitSlug ? <Link className="text-cyan-300" href={`/biblioteca/${r.kitSlug}`}>{r.page}</Link> : r.page}</td></tr>)}</tbody></table>}
    </div>
  </section>;
}
