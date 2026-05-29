import { redirect } from "next/navigation";
import { MessageSquare, Music2, Wand2 } from "lucide-react";

import { MinistryShell, formatDate, PremiumPanel, statusLabel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryOwner } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function requestStatusLabel(status?: string | null) {
  if (status === "reviewing") return "Em análise";
  if (status === "approved") return "Aprovado";
  if (status === "done") return "Concluído";
  if (status === "rejected") return "Rejeitado";
  return statusLabel(status);
}

function typeLabel(type?: string | null) {
  return type === "tone" ? "Solicitação de tom" : "Solicitação de música";
}

export default async function MinisterioSolicitacoesPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryOwner(context) && !context.isAdmin) redirect("/ministerio");

  const admin = createSupabaseAdminClient() as any;
  const { data } = await admin
    .from("premium_requests")
    .select("id,request_type,song_name,artist_name,desired_tone,voice_part,status,created_at,updated_at,delivered_kit_slug,delivered_at,profile:profiles(full_name,email)")
    .eq("ministry_id", context.ministry.ministryId)
    .order("created_at", { ascending: false })
    .limit(100);

  const requests = data ?? [];
  const songs = requests.filter((item: any) => item.request_type === "song");
  const tones = requests.filter((item: any) => item.request_type === "tone");

  return (
    <MinistryShell>
      <div className="rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <MessageSquare className="h-4 w-4" /> Solicitações Ministeriais
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Acompanhe a produção</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">Pedidos enviados pelo responsável ministerial usando a mesma fila do painel administrativo.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Metric icon={<Music2 className="h-5 w-5" />} label="Solicitações de Música" value={songs.length} />
          <Metric icon={<Wand2 className="h-5 w-5" />} label="Solicitações de Tons" value={tones.length} />
        </div>
      </div>

      <PremiumPanel>
        <h2 className="text-2xl font-semibold">Fila do ministério</h2>
        <p className="mt-2 text-sm text-zinc-400">Últimas 100 solicitações vinculadas ao plano ministerial.</p>
        {requests.length ? (
          <div className="mt-6 grid gap-3">
            {requests.map((item: any) => (
              <article key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">{typeLabel(item.request_type)}</span>
                    <h3 className="mt-3 text-lg font-semibold text-white">{item.song_name}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{item.artist_name || "Artista não informado"}</p>
                    {item.request_type === "tone" ? <p className="mt-2 text-sm text-emerald-200">Tom: {item.desired_tone || "—"}{item.voice_part ? ` • ${item.voice_part}` : ""}</p> : null}
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm font-semibold text-white">{requestStatusLabel(item.status)}</p>
                    <p className="mt-1 text-xs text-zinc-500">Enviado em {formatDate(item.created_at)}</p>
                    {item.delivered_kit_slug ? <p className="mt-2 text-xs text-emerald-200">Entregue: {item.delivered_kit_slug}</p> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Nenhuma solicitação ministerial encontrada.</div>
        )}
      </PremiumPanel>
    </MinistryShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"><div className="text-cyan-200">{icon}</div><p className="mt-4 text-xs uppercase tracking-[0.14em] text-zinc-400">{label}</p><p className="mt-2 text-3xl font-semibold text-white">{value}</p></div>;
}
