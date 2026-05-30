import { revalidatePath } from "next/cache";
import { BarChart3, ExternalLink, MessageSquareText, Music2, Trash2, Wand2 } from "lucide-react";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { deletePremiumRequest, getPremiumRequests, getPremiumRequestStats, updatePremiumRequestStatus, type PremiumRequestStatus } from "@/lib/data/premium-analytics";

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
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "-";
  }
}

function summarizeRequest(row: any) {
  if (row.type === "tone_request") return `${row.title ?? "Kit"} • Tom: ${row.requested_tone ?? "não informado"}`;
  if (row.type === "feedback") return row.message ?? row.title ?? "Feedback recebido";
  return `${row.title ?? "Música"}${row.artist ? ` • ${row.artist}` : ""}${row.urgency ? ` • Urgência: ${urgencyLabels[row.urgency] ?? row.urgency}` : ""}`;
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
    return true;
  });

  async function setStatus(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const status = String(formData.get("status") ?? "in_review") as PremiumRequestStatus;
    await updatePremiumRequestStatus(id, status);
    revalidatePath("/admin/harmomus-premium/solicitacoes");
    revalidatePath("/admin/harmomus-premium");
  }

  async function remove(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    await deletePremiumRequest(id);
    revalidatePath("/admin/harmomus-premium/solicitacoes");
    revalidatePath("/admin/harmomus-premium");
  }

  return (
    <section className="space-y-7">
      <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-[#172034] via-surface to-[#111827] p-7 shadow-premium">
        <p className="text-xs uppercase tracking-[0.28em] text-gold-300">Harmomus Premium</p>
        <h1 className="mt-2 text-4xl font-black text-white">Solicitações</h1>
        <p className="mt-2 text-muted">Gerencie pedidos de músicas, novos tons e feedbacks enviados pelos assinantes premium.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<BarChart3 size={20} />} label="Últimos dias" value={String(stats.total)} />
        <MetricCard icon={<Music2 size={20} />} label="Solicitações de músicas" value={String(stats.music)} />
        <MetricCard icon={<Wand2 size={20} />} label="Solicitações de tons" value={String(stats.tone)} />
        <MetricCard icon={<MessageSquareText size={20} />} label="Feedback" value={String(stats.feedback)} />
      </div>

      <form className="grid gap-4 rounded-3xl border border-border bg-surface p-5 shadow-premium md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <label className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Tipo
          <select name="type" defaultValue={params.type ?? ""} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-white">
            <option value="">Todos</option>
            <option value="music_request">Músicas</option>
            <option value="tone_request">Tons</option>
            <option value="feedback">Feedback</option>
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Status
          <select name="status" defaultValue={params.status ?? ""} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-white">
            <option value="">Todos</option>
            <option value="new">Novo</option>
            <option value="in_review">Em análise</option>
            <option value="done">Concluído</option>
            <option value="archived">Arquivado</option>
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Urgência
          <select name="urgency" defaultValue={params.urgency ?? ""} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-white">
            <option value="">Todas</option>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </label>
        <label className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Período
          <select name="period" defaultValue={params.period ?? "30"} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-4 text-white">
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
          </select>
        </label>
        <button className="self-end rounded-xl bg-violet-500 px-6 py-3 font-bold text-white shadow-lg shadow-violet-900/30">🔍 Filtrar</button>
      </form>

      <div className="text-sm font-semibold text-muted">Total filtrado: <span className="text-white">{requests.length}</span> solicitações</div>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
        <div className="overflow-x-auto">
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
                    {row.message ? <p className="mt-1 max-w-md text-xs text-muted">{row.message}</p> : null}
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
                      <form action={setStatus}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="status" value="in_review" />
                        <button className="rounded-lg border border-violet-400/40 bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200">Abrir</button>
                      </form>
                      <form action={setStatus}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="status" value="done" />
                        <button className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200">Concluir</button>
                      </form>
                      <form action={remove}>
                        <input type="hidden" name="id" value={row.id} />
                        <ConfirmSubmitButton message={`Tem certeza que deseja deletar esta solicitação premium? ${summarizeRequest(row)}`} className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-200 transition hover:bg-red-500/25"><Trash2 size={13} />Deletar</ConfirmSubmitButton>
                      </form>
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
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
      <div className="flex items-center gap-2 text-muted">{icon}<span className="text-xs font-bold uppercase tracking-[0.2em]">{label}</span></div>
      <p className="mt-4 text-4xl font-black text-cyan-300">{value}</p>
    </div>
  );
}
