import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { getAdminFeedbackDashboard, type FeedbackPeriod } from "@/lib/data/feedback-survey";
import { formatDateTimeBR } from "@/lib/format-date-time-br";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function Metric({ label, value, helper, tone = "default" }: { label: string; value: string | number; helper: string; tone?: "default" | "good" | "warn" }) {
  const classes = {
    default: "border-white/10 bg-white/[0.025]",
    good: "border-emerald-400/20 bg-emerald-500/[0.06]",
    warn: "border-amber-400/20 bg-amber-500/[0.06]",
  };
  return (
    <article className={`min-w-[165px] rounded-3xl border p-4 ${classes[tone]}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{helper}</p>
    </article>
  );
}

export default async function FeedbackAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const period: FeedbackPeriod = params.period === "7" || params.period === "90" ? params.period : "30";
  const dashboard = await getAdminFeedbackDashboard(period);
  const { summary } = dashboard;
  const maxNeed = Math.max(...dashboard.needs.map((item) => item.value), 1);
  const maxRating = Math.max(...dashboard.ratings.map((item) => item.value), 1);

  return (
    <section className="min-w-0 space-y-5 overflow-hidden text-zinc-100">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Feedback dos usuários" description="Acompanhe satisfação, prioridades declaradas e sugestões de repertório coletadas dentro do Harmomus." />
        <div className="flex gap-2">
          <Link href="/admin/demanda-repertorio" className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:border-violet-400/30 hover:bg-violet-500/10">Demanda de repertório</Link>
          <Link href="/admin/analytics" className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/10">Analytics</Link>
        </div>
      </div>

      <form className="rounded-3xl border border-white/10 bg-zinc-950/55 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select name="period" defaultValue={period} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none">
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
          <button className="rounded-2xl border border-violet-400/30 bg-violet-500/10 px-5 py-3 text-sm font-semibold text-violet-100 hover:bg-violet-500/15">Aplicar período</button>
          <span className="ml-auto text-xs text-zinc-600">Pesquisa atual: Product Pulse v1</span>
        </div>
      </form>

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 xl:grid-cols-6">
        <Metric label="Respostas" value={summary.responses} helper="questionários concluídos" tone="good" />
        <Metric label="Nota média" value={summary.avgRating ? `${summary.avgRating}/5` : "-"} helper="experiência geral" tone={summary.avgRating >= 4 ? "good" : summary.avgRating > 0 && summary.avgRating < 3 ? "warn" : "default"} />
        <Metric label="Taxa de resposta" value={`${summary.responseRate}%`} helper={`${summary.shown} exibições`} />
        <Metric label="Catálogo" value={`${summary.catalogNeed}%`} helper="marcaram mais músicas" tone={summary.catalogNeed >= 40 ? "warn" : "default"} />
        <Metric label="Músicas sugeridas" value={summary.songSuggestions} helper="pedidos escritos" />
        <Metric label="Comentários" value={summary.comments} helper="feedback qualitativo" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[2rem] border border-white/10 bg-zinc-950/55 p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300/70">Prioridade declarada</p>
            <h2 className="mt-1 text-xl font-semibold text-white">O que mais faria diferença?</h2>
          </div>
          <div className="mt-5 space-y-4">
            {dashboard.needs.length === 0 ? <p className="text-sm text-zinc-500">Ainda não há respostas neste período.</p> : dashboard.needs.map((item) => (
              <div key={item.key}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="text-zinc-300">{item.label}</span><span className="font-semibold text-white">{item.value}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-300" style={{ width: `${Math.max(5, (item.value / maxNeed) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-zinc-950/55 p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/70">Satisfação</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Distribuição das notas</h2>
          </div>
          <div className="mt-5 space-y-4">
            {dashboard.ratings.map((item) => (
              <div key={item.rating}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="text-zinc-300">Nota {item.rating}</span><span className="font-semibold text-white">{item.value}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${item.value ? Math.max(5, (item.value / maxRating) * 100) : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[2rem] border border-amber-400/15 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.09),transparent_35%),rgba(9,9,11,0.80)] p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200/70">Repertório solicitado</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Músicas citadas na pesquisa</h2>
            <p className="mt-1 text-sm text-zinc-500">Cruze este ranking com as buscas sem resultado para priorizar produção.</p>
          </div>
          <Link href="/admin/demanda-repertorio" className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-100">Comparar com buscas</Link>
        </div>
        <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.songs.length === 0 ? <p className="text-sm text-zinc-500">As músicas sugeridas aparecerão aqui.</p> : dashboard.songs.map((item, index) => (
            <div key={`${item.song}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-black/20 px-4 py-3">
              <span className="min-w-0 truncate text-sm text-white"><b className="mr-2 text-amber-300">{index + 1}.</b>{item.song}</span>
              <span className="shrink-0 text-xs font-semibold text-zinc-400">{item.requests} pedido(s)</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-base font-semibold text-white">Respostas recentes</h2><p className="mt-1 text-xs text-zinc-500">Feedback individual para leitura qualitativa.</p></div>
          <p className="text-xs text-zinc-600">Exibido {summary.shown} vez(es) · adiado {summary.dismissed} vez(es)</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          {dashboard.recent.length === 0 ? <p className="text-sm text-zinc-500">Ainda não há respostas.</p> : (
            <table className="min-w-[1050px] w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.12em] text-zinc-500"><tr><th className="pb-3">Quando</th><th className="pb-3">Usuário</th><th className="pb-3">Nota</th><th className="pb-3">Prioridade</th><th className="pb-3">Música</th><th className="pb-3">Comentário</th><th className="pb-3">Plano</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {dashboard.recent.map((item) => <tr key={item.id}><td className="py-3 pr-4 text-zinc-500">{item.when ? formatDateTimeBR(item.when) : "-"}</td><td className="py-3 pr-4 font-medium text-white">{item.user}</td><td className="py-3 pr-4"><span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-100">{item.rating}/5</span></td><td className="py-3 pr-4 text-zinc-300">{item.need}</td><td className="max-w-[190px] truncate py-3 pr-4 text-amber-100">{item.song || "-"}</td><td className="max-w-[320px] truncate py-3 pr-4 text-zinc-400" title={item.comment}>{item.comment || "-"}</td><td className="py-3 text-zinc-500">{item.plan}</td></tr>)}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </section>
  );
}
