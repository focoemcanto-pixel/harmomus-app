import { MessageSquare, Music2, Wand2 } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function statusLabel(status?: string | null) {
  if (status === "pending") return "Pendente";
  if (status === "reviewing") return "Em análise";
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Rejeitado";
  if (status === "done") return "Concluído";
  return status || "—";
}

function typeLabel(type?: string | null) {
  return type === "tone" ? "Novo tom" : "Nova música";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function AdminSolicitacoesPage() {
  const supabase = createSupabaseAdminClient() as any;

  const { data: requests } = await supabase
    .from("premium_requests")
    .select("*, profile:profiles(full_name,email), ministry:ministries(name,plan_type)")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = requests ?? [];
  const pending = rows.filter((item: any) => item.status === "pending").length;
  const tones = rows.filter((item: any) => item.request_type === "tone").length;
  const songs = rows.filter((item: any) => item.request_type === "song").length;

  return (
    <section className="space-y-6">
      <PageHeader title="Solicitações Premium" description="Acompanhe pedidos reais de novas músicas e novos tons enviados por assinantes Premium e responsáveis ministeriais." />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<MessageSquare className="h-5 w-5" />} label="Pendentes" value={pending} />
        <MetricCard icon={<Wand2 className="h-5 w-5" />} label="Pedidos de tom" value={tones} />
        <MetricCard icon={<Music2 className="h-5 w-5" />} label="Novas músicas" value={songs} />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-premium">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">Fila de produção</h3>
          <p className="mt-1 text-sm text-muted">Últimas 100 solicitações recebidas.</p>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Música</th>
                  <th className="px-4 py-3">Tom/Nipe</th>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Ministério</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((item: any) => (
                  <tr key={item.id} className="transition hover:bg-surface-muted/60">
                    <td className="px-4 py-4">
                      <span className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-semibold text-gold-300">
                        {typeLabel(item.request_type)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground">{item.song_name}</p>
                      <p className="mt-1 text-xs text-muted">{item.artist_name || item.reference_link || item.notes || "Sem detalhes adicionais"}</p>
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
                      <span className="rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-foreground">
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted">{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10 text-sm text-muted">Nenhuma solicitação recebida ainda.</div>
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
