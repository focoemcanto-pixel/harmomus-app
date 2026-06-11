import Link from "next/link";
import { revalidatePath } from "next/cache";
import { BarChart3, ExternalLink, Eye, MessageSquareText, Music2, Trash2, Wand2 } from "lucide-react";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { getPremiumRequests, getPremiumRequestStats, updatePremiumRequestStatus, type PremiumRequestStatus } from "@/lib/data/premium-analytics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const typeLabels: Record<string, string> = {
  music_request: "Música nova",
  tone_request: "Novo tom",
  feedback: "Feedback",
};

const statusLabels: Record<string, string> = {
  new: "Novo",
  in_review: "Em análise",
  done: "Concluído",
  archived: "Arquivado",
};

const urgencyLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

function formatDate(value?: string | null) {
  return formatDateTimeBR(value);
}

function summarizeRequest(row: any) {
  if (row.type === "tone_request") return `${row.title ?? "Kit"} • Tom: ${row.requested_tone ?? "não informado"}`;
  if (row.type === "feedback") return row.message ?? row.title ?? "Feedback recebido";
  return `${row.title ?? "Música"}${row.artist ? ` • ${row.artist}` : ""}${row.urgency ? ` • Urgência: ${urgencyLabels[row.urgency] ?? row.urgency}` : ""}`;
}

function statusClass(status?: string | null) {
  if (status === "new") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (status === "in_review") return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
  if (status === "done") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  return "border-white/10 bg-white/10 text-zinc-200";
}

export default async function PremiumRequestsAdminPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; urgency?: string; period?: string }> }) {
  const params = await searchParams;
  const [allRequests, stats] = await Promise.all([
    getPremiumRequests().catch(() => []),
    getPremiumRequestStats(Number(params.period ?? 30) || 30).catch(() => ({ total: 0, music: 0, tone: 0, feedback: 0, new: 0 })),
  ]);

  const requests = allRequests.filter((row: any) => {
    if (params.type && row.type !== params.type) return false;
    if (params.status && row.status !== params.status) return false;
    if (params.urgency && row.urgency !== params.urgency) return false;
    if (!params.status && row.status === "archived") return false;
    return true;
  });

  async function setStatus(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "in_review") as PremiumRequestStatus;
    if (!id) return;
    try {
      await updatePremiumRequestStatus(id, status);
    } catch (error) {
      console.error("[premium-requests.admin] status update failed", error);
    }
    revalidatePath("/admin/harmomus-premium/solicitacoes");
    revalidatePath(`/admin/harmomus-premium/solicitacoes/${id}`);
    revalidatePath("/admin/harmomus-premium");
  }

  async function remove(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    try {
      await updatePremiumRequestStatus(id, "archived");
    } catch (error) {
      console.error("[premium-requests.admin] archive failed", error);
    }
    revalidatePath("/admin/harmomus-premium/solicitacoes");
    revalidatePath(`/admin/harmomus-premium/solicitacoes/${id}`);
    revalidatePath("/admin/harmomus-premium");
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-[#172034] via-surface to-[#111827] p-4 shadow-premium sm:p-7">
        <p className="text-[11px] uppercase tracking-[0.22em] text-gold-300 sm:text-xs sm:tracking-[0.28em]">Harmomus Premium</p>
        <h1 className="mt-2 text-2xl font-black text-white sm:text-4xl">Solicitações</h1>
        <p className="mt-2 text-sm text-muted sm:text-base">Gerencie pedidos de músicas, novos tons e feedbacks enviados pelos assinantes premium.</p>
      </div>

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-4 md:px-0">
        <MetricCard icon={<BarChart3 size={18} />} label="Últimos dias" value={String(stats.total)} />
        <MetricCard icon={<Music2 size={18} />} label="Músicas" value={String(stats.music)} />
        <MetricCard icon={<Wand2 size={18} />} label="Tons" value={String(stats.tone)} />
        <MetricCard icon={<MessageSquareText size={18} />} label="Feedback" value={String(stats.feedback)} />
      </div>

      <form className="grid gap-3 rounded-3xl border border-border bg-surface p-3 shadow-premium sm:p-5 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted sm:text-xs">Tipo
          <select name="type" defaultValue={params.type ?? ""} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white sm:h-12 sm:px-4">
            <option value="">Todos</option>
            <option value="music_request">Músicas</option>
            <option value="tone_request">Tons</option>
            <option value="feedback">Feedback</option>
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted sm:text-xs">Status
          <select name="status" defaultValue={params.status ?? ""} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white sm:h-12 sm:px-4">
            <option value="">Ativas</option>
            <option value="new">Novo</option>
            <option value="in_review">Em análise</option>
            <option value="done">Concluído</option>
            <option value="archived">Arquivadas</option>
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted sm:text-xs">Urgência
          <select name="urgency" defaultValue={params.urgency ?? ""} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white sm:h-12 sm:px-4">
            <option value="">Todas</option>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted sm:text-xs">Período
          <select name="period" defaultValue={params.period ?? "30"} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white sm:h-12 sm:px-4">
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
          </select>
        </label>
        <button className="self-end rounded-xl bg-violet-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-900/30">Filtrar</button>
      </form>

      <div className="text-sm font-semibold text-muted">Total filtrado: <span className="text-white">{requests.length}</span> solicitações</div>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
        <div className="grid gap-3 p-3 lg:hidden">
          {requests.map((row: any) => (
            <article key={row.id} className="rounded-2xl border border-white/10 bg-background/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{summarizeRequest(row)}</p>
                  <p className="mt-1 text-xs text-muted">{formatDate(row.created_at)}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(row.status)}`}>{statusLabels[row.status] ?? row.status}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-300">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{typeLabels[row.type] ?? row.type}</span>
                {row.urgency ? <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-amber-100">{urgencyLabels[row.urgency] ?? row.urgency}</span> : null}
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">ID {String(row.id).slice(0, 8)}</span>
              </div>

              {row.message ? <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted">{row.message}</p> : null}
              {row.reference_url ? <a href={row.reference_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300"><ExternalLink size={13} /> Abrir referência</a> : null}

              <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="truncate text-sm font-semibold text-white">{row.profiles?.full_name ?? "Sem nome"}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{row.profiles?.email ?? "Sem e-mail"}</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href={`/admin/harmomus-premium/solicitacoes/${row.id}`} className="inline-flex items-center justify-center gap-1 rounded-xl border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200 transition hover:bg-violet-500/25">
                  <Eye size={13} /> Detalhes
                </Link>
                {row.status !== "in_review" ? (
                  <form action={setStatus} className="contents">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value="in_review" />
                    <button className="rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-200">Analisar</button>
                  </form>
                ) : null}
                {row.status !== "done" ? (
                  <form action={setStatus} className="contents">
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="status" value="done" />
                    <button className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200">Concluir</button>
                  </form>
                ) : null}
                {row.status !== "archived" ? (
                  <form action={remove} className="contents">
                    <input type="hidden" name="id" value={row.id} />
                    <ConfirmSubmitButton message={`Tem certeza que deseja arquivar esta solicitação premium? ${summarizeRequest(row)}`} className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-400/40 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200 transition hover:bg-red-500/25" confirmLabel="Arquivar solicitação"><Trash2 size={13} />Arquivar</ConfirmSubmitButton>
                  </form>
                ) : null}
              </div>
            </article>
          ))}
          {!requests.length ? <div className="p-8 text-center text-sm text-muted">Nenhuma solicitação encontrada ainda.</div> : null}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-[0.2em] text-muted">
              <tr>
                <th className="px-5 py-4">ID</th>
                <th className="px-5 py-4">Data</th>
                <th className="px-5 py-4">Tipo</th>
                <th className="px-5 py-4">Resumo</th>
                <th className="px-5 py-4">Usuário</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row: any) => (
                <tr key={row.id} className="border-t border-border/70 align-top">
                  <td className="px-5 py-4 font-bold text-muted">{String(row.id).slice(0, 8)}</td>
                  <td className="px-5 py-4 text-zinc-300">{formatDate(row.created_at)}</td>
                  <td className="px-5 py-4"><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold uppercase text-zinc-200">{typeLabels[row.type] ?? row.type}</span></td>
                  <td className="px-5 py-4">
                    <p className="max-w-md font-semibold text-white">{summarizeRequest(row)}</p>
                    {row.message ? <p className="mt-1 max-w-md text-xs text-muted line-clamp-2">{row.message}</p> : null}
                    {row.reference_url ? <a href={row.reference_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300"><ExternalLink size={13} /> Abrir referência</a> : null}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-white/10">
                        {row.profiles?.avatar_url ? <img src={row.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : "👤"}
                      </div>
                      <div>
                        <p className="font-bold text-white">{row.profiles?.full_name ?? "Sem nome"}</p>
                        <p className="text-xs text-muted">{row.profiles?.email ?? "Sem e-mail"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4"><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase text-zinc-200">{statusLabels[row.status] ?? row.status}</span></td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/harmomus-premium/solicitacoes/${row.id}`} className="inline-flex items-center gap-1 rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200 transition hover:bg-violet-500/25">
                        <Eye size={13} /> Detalhes
                      </Link>
                      {row.status !== "in_review" ? (
                        <form action={setStatus}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="status" value="in_review" />
                          <button className="rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-200">Analisar</button>
                        </form>
                      ) : null}
                      {row.status !== "done" ? (
                        <form action={setStatus}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="status" value="done" />
                          <button className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200">Concluir</button>
                        </form>
                      ) : null}
                      {row.status !== "archived" ? (
                        <form action={remove}>
                          <input type="hidden" name="id" value={row.id} />
                          <ConfirmSubmitButton message={`Tem certeza que deseja arquivar esta solicitação premium? ${summarizeRequest(row)}`} className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200 transition hover:bg-red-500/25" confirmLabel="Arquivar solicitação"><Trash2 size={13} />Arquivar</ConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!requests.length ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-muted">Nenhuma solicitação encontrada ainda. Quando um assinante enviar pedido de música, tom ou feedback, aparecerá aqui.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-[165px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
      <div className="flex items-center gap-2 text-muted">{icon}<span className="text-[11px] font-bold uppercase tracking-[0.18em] sm:text-xs sm:tracking-[0.2em]">{label}</span></div>
      <p className="mt-3 text-2xl font-black text-cyan-300 sm:mt-4 sm:text-4xl">{value}</p>
    </div>
  );
}
