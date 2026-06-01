import Link from "next/link";
import { MessageSquare, Music2, Wand2 } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_OPTIONS = [
  ["pending", "Pendente"],
  ["reviewing", "Em análise"],
  ["approved", "Aprovado"],
  ["done", "Concluído"],
  ["rejected", "Rejeitado"],
] as const;

const TYPE_OPTIONS = [
  ["song", "Nova música"],
  ["tone", "Novo tom"],
  ["feedback", "Feedback"],
] as const;

function statusLabel(status?: string | null) {
  if (status === "pending") return "Pendente";
  if (status === "reviewing") return "Em análise";
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Rejeitado";
  if (status === "done") return "Concluído";
  return status || "—";
}

function typeLabel(type?: string | null) {
  if (type === "tone") return "Novo tom";
  if (type === "feedback") return "Feedback";
  return "Nova música";
}

function formatDate(value?: string | null) {
  return formatDateTimeBR(value).replace("-", "—");
}

function safeParam(value?: string | string[]) {
  return typeof value === "string" ? value : "";
}

export default async function AdminSolicitacoesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const statusFilter = safeParam(params.status);
  const typeFilter = safeParam(params.type);
  const search = safeParam(params.q).trim();

  const supabase = createSupabaseAdminClient() as any;

  let query = supabase
    .from("premium_requests")
    .select("*, profile:profiles(full_name,email), ministry:ministries(name,plan_type)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (STATUS_OPTIONS.some(([value]) => value === statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  if (TYPE_OPTIONS.some(([value]) => value === typeFilter)) {
    query = query.eq("request_type", typeFilter);
  }

  if (search) {
    query = query.or(`song_name.ilike.%${search}%,artist_name.ilike.%${search}%,notes.ilike.%${search}%`);
  }

  const { data: requests } = await query;

  const rows = requests ?? [];
  const pending = rows.filter((item: any) => item.status === "pending").length;
  const tones = rows.filter((item: any) => item.request_type === "tone").length;
  const songs = rows.filter((item: any) => item.request_type === "song").length;
  const feedbacks = rows.filter((item: any) => item.request_type === "feedback").length;

  return (
    <section className="space-y-6">
      <PageHeader title="Solicitações Premium" description="Acompanhe pedidos reais de novas músicas, novos tons e feedbacks enviados por assinantes Premium e responsáveis ministeriais." />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<MessageSquare className="h-5 w-5" />} label="Pendentes nesta visão" value={pending} />
        <MetricCard icon={<Wand2 className="h-5 w-5" />} label="Pedidos de tom" value={tones} />
        <MetricCard icon={<Music2 className="h-5 w-5" />} label="Novas músicas" value={songs} />
        <MetricCard icon={<MessageSquare className="h-5 w-5" />} label="Feedbacks" value={feedbacks} />
      </div>

      <form className="rounded-xl border border-border bg-surface p-4 shadow-premium" action="/admin/solicitacoes">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
          <label className="block text-sm font-medium text-foreground">
            Buscar
            <input name="q" defaultValue={search} placeholder="Música, artista ou observação" className="mt-2 h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground outline-none focus:border-gold-400" />
          </label>

          <label className="block text-sm font-medium text-foreground">
            Tipo
            <select name="type" defaultValue={typeFilter} className="mt-2 h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground outline-none focus:border-gold-400">
              <option value="">Todos</option>
              {TYPE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="block text-sm font-medium text-foreground">
            Status
            <select name="status" defaultValue={statusFilter} className="mt-2 h-11 w-full rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground outline-none focus:border-gold-400">
              <option value="">Todos</option>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <div className="flex gap-2">
            <button className="h-11 rounded-xl bg-gold-500 px-5 text-sm font-semibold text-black transition hover:bg-gold-400">Filtrar</button>
            <Link href="/admin/solicitacoes" className="grid h-11 place-items-center rounded-xl border border-border px-4 text-sm text-muted transition hover:text-foreground">Limpar</Link>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-premium">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">Fila de produção</h3>
          <p className="mt-1 text-sm text-muted">Últimas 100 solicitações recebidas conforme os filtros aplicados.</p>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Música/Assunto</th>
                  <th className="px-4 py-3">Tom/Nipe</th>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Ministério</th>
                  <th className="px-4 py-3">Status/Entrega</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((item: any) => (
                  <tr key={item.id} className="transition hover:bg-surface-muted/60 align-top">
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-300">
                        {typeLabel(item.request_type)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground">{item.song_name}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{item.artist_name || item.reference_link || item.notes || "Sem detalhes adicionais"}</p>
                      {item.delivered_kit_slug ? (
                        <Link href={`/biblioteca/${item.delivered_kit_slug}`} className="mt-2 inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                          Kit entregue: {item.delivered_kit_slug}
                        </Link>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-muted">
                      {item.request_type === "tone" ? `${item.desired_tone || "—"}${item.voice_part ? ` • ${item.voice_part}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-foreground">{item.profile?.full_name || "Usuário"}</p>
                      <p className="text-xs text-muted">{item.profile?.email || "—"}</p>
                    </td>
                    <td className="px-4 py-4 text-muted">{item.ministry?.name || "Individual"}</td>
                    <td className="px-4 py-4">
                      <form action="/api/admin/premium-requests/status" method="post" className="space-y-2">
                        <input type="hidden" name="request_id" value={item.id} />

                        <select name="status" defaultValue={item.status} className="h-10 min-w-[170px] rounded-xl border border-border bg-surface-muted px-3 text-sm text-foreground outline-none focus:border-gold-400">
                          {STATUS_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>

                        {item.request_type !== "feedback" ? (
                          <input name="delivered_kit_slug" defaultValue={item.delivered_kit_slug ?? ""} placeholder="slug-do-kit-entregue" className="h-10 min-w-[170px] rounded-xl border border-border bg-surface-muted px-3 text-xs text-foreground outline-none focus:border-gold-400" />
                        ) : null}

                        <button className="w-full rounded-xl bg-gold-500 px-3 py-2 text-xs font-semibold text-black transition hover:bg-gold-400">
                          Atualizar
                        </button>

                        <span className="inline-flex rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-foreground">
                          {statusLabel(item.status)}
                        </span>
                      </form>
                    </td>
                    <td className="px-4 py-4 text-muted">{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-sm text-muted">Nenhuma solicitação encontrada com os filtros atuais.</div>
        )}
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-premium">
      <div className="flex items-center gap-3 text-gold-300">{icon}<span className="text-sm font-medium text-muted">{label}</span></div>
      <p className="mt-4 text-3xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
