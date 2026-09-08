import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { getSearchDemandDashboard, type SearchDemandPeriod } from "@/lib/data/search-demand";
import { formatDateTimeBR } from "@/lib/format-date-time-br";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function number(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function Metric({ label, value, helper, tone = "default" }: { label: string; value: string | number; helper: string; tone?: "default" | "warn" | "good" }) {
  const styles = {
    default: "border-white/10 bg-white/[0.025]",
    warn: "border-amber-400/20 bg-amber-500/[0.06]",
    good: "border-emerald-400/20 bg-emerald-500/[0.06]",
  };
  return (
    <article className={`min-w-[170px] rounded-3xl border p-4 ${styles[tone]}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{typeof value === "number" ? number(value) : value}</p>
      <p className="mt-1 text-xs text-zinc-500">{helper}</p>
    </article>
  );
}

export default async function RepertoireDemandPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const period: SearchDemandPeriod = params.period === "7" || params.period === "90" ? params.period : "30";
  const query = params.q ?? "";
  const dashboard = await getSearchDemandDashboard({ period, query });
  const { summary } = dashboard;

  return (
    <section className="min-w-0 space-y-5 overflow-hidden text-zinc-100">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Demanda de repertório" description="Veja o que os usuários procuram, o que encontram e, principalmente, as músicas que ainda faltam no Harmomus." />
        <Link href="/admin/analytics" className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/10">Analytics geral</Link>
      </div>

      <form className="rounded-3xl border border-white/10 bg-zinc-950/55 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
          <select name="period" defaultValue={period} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none">
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
          <input name="q" defaultValue={query} placeholder="Filtrar termo pesquisado" className="min-w-0 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-zinc-600" />
          <button className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/15">Aplicar</button>
        </div>
      </form>

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 xl:grid-cols-6">
        <Metric label="Buscas" value={summary.searches} helper="consultas registradas" />
        <Metric label="Sem resultado" value={summary.missedSearches} helper="lacunas reais do catálogo" tone="warn" />
        <Metric label="Taxa sem resultado" value={`${summary.missRate}%`} helper="quanto da demanda não atendemos" tone={summary.missRate > 20 ? "warn" : "default"} />
        <Metric label="Com resultado" value={summary.foundSearches} helper="buscas atendidas" tone="good" />
        <Metric label="Termos únicos" value={summary.uniqueTerms} helper="intenções diferentes" />
        <Metric label="Usuários" value={summary.uniqueUsers} helper="pessoas que pesquisaram" />
      </div>

      <div className="rounded-[2rem] border border-amber-400/15 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_32%),rgba(9,9,11,0.80)] p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200/70">Prioridade de produção</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Buscas sem resultado</h2>
            <p className="mt-1 text-sm text-zinc-500">Ordenadas por volume de busca e quantidade de usuários diferentes.</p>
          </div>
          <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">{dashboard.demand.length} termo(s)</span>
        </div>

        <div className="mt-5 overflow-x-auto">
          {dashboard.demand.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-zinc-500">Ainda não há buscas sem resultado neste período.</div>
          ) : (
            <table className="min-w-[760px] w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="pb-3">#</th><th className="pb-3">Música / termo</th><th className="pb-3 text-right">Buscas</th><th className="pb-3 text-right">Usuários</th><th className="pb-3">Última busca</th><th className="pb-3">Origem</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {dashboard.demand.map((item, index) => (
                  <tr key={`${item.query}-${index}`}>
                    <td className="py-3 pr-3 font-semibold text-amber-300">{index + 1}</td>
                    <td className="py-3 pr-4 font-medium text-white">{item.query}</td>
                    <td className="py-3 text-right font-semibold text-white">{number(item.searches)}</td>
                    <td className="py-3 text-right text-zinc-300">{number(item.uniqueUsers)}</td>
                    <td className="py-3 pl-5 text-zinc-400">{item.lastSearch ? formatDateTimeBR(item.lastSearch) : "-"}</td>
                    <td className="py-3 text-zinc-500">{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-white">Mais procuradas que existem</h2>
          <p className="mt-1 text-xs text-zinc-500">Ajuda a entender quais repertórios do catálogo têm maior intenção de procura.</p>
          <div className="mt-4 space-y-2">
            {dashboard.successful.length === 0 ? <p className="text-sm text-zinc-500">Ainda sem dados.</p> : dashboard.successful.map((item, index) => (
              <div key={`${item.query}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                <span className="min-w-0 truncate text-sm text-zinc-200"><b className="mr-2 text-emerald-300">{index + 1}.</b>{item.query}</span>
                <span className="shrink-0 text-xs font-semibold text-zinc-400">{number(item.searches)} busca(s)</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-white">Origem das buscas</h2>
          <p className="mt-1 text-xs text-zinc-500">Mostra em qual experiência do Harmomus a pesquisa aconteceu.</p>
          <div className="mt-4 space-y-2">
            {dashboard.sources.length === 0 ? <p className="text-sm text-zinc-500">Ainda sem dados.</p> : dashboard.sources.map((item) => (
              <div key={item.source} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                <span className="text-sm text-zinc-300">{item.source}</span>
                <span className="text-xs font-semibold text-white">{number(item.searches)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-white">Buscas recentes</h2>
        <div className="mt-4 overflow-x-auto">
          {dashboard.recent.length === 0 ? <p className="text-sm text-zinc-500">As novas pesquisas aparecerão aqui assim que os usuários começarem a usar a busca.</p> : (
            <table className="min-w-[760px] w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="pb-3">Quando</th><th className="pb-3">Busca</th><th className="pb-3">Resultado</th><th className="pb-3">Plano</th><th className="pb-3">Origem</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {dashboard.recent.map((item) => <tr key={item.id}><td className="py-3 pr-4 text-zinc-400">{item.createdAt ? formatDateTimeBR(item.createdAt) : "-"}</td><td className="py-3 pr-4 font-medium text-white">{item.query}</td><td className="py-3 pr-4"><span className={`rounded-full border px-2 py-1 text-xs ${item.found ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-amber-400/20 bg-amber-500/10 text-amber-200"}`}>{item.found ? `${item.resultCount} encontrado(s)` : "Não encontrada"}</span></td><td className="py-3 pr-4 text-zinc-400">{item.viewerPlan}</td><td className="py-3 text-zinc-500">{item.source}</td></tr>)}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </section>
  );
}
