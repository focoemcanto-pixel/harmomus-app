import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";

import { formatDate, MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ActivityLogRow = {
  id: string;
  actor_name: string | null;
  action: string;
  description: string;
  created_at: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actionLabel(action?: string | null) {
  const normalized = String(action ?? "").toLowerCase();
  const labels: Record<string, string> = {
    "invite.created": "Convite criado",
    "invite.resent": "Convite reenviado",
    "member.removed": "Integrante removido",
    "member.restored": "Integrante restaurado",
    "member.promoted": "Permissão promovida",
    "member.demoted": "Permissão rebaixada",
    "repertoire.created": "Repertório criado",
    "repertoire.kit_added": "Kit adicionado",
  };
  return labels[normalized] ?? action ?? "Ação";
}

export default async function MinistryHistoryPage() {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const { data, error } = await admin
    .from("ministry_activity_logs")
    .select("id,actor_name,action,description,created_at")
    .eq("ministry_id", context.ministry.ministryId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const logs = (data ?? []) as ActivityLogRow[];

  return (
    <MinistryShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/ministerio" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar para a central
        </Link>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <History className="h-4 w-4" /> Histórico ministerial
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Histórico de ações</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 md:text-base">
          Acompanhe as principais ações realizadas por responsáveis e admins do ministério.
        </p>
      </div>

      <PremiumPanel className="overflow-hidden p-0">
        {logs.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="border-y border-white/10 bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Ator</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Tipo da ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top transition hover:bg-white/[0.035]">
                    <td className="whitespace-nowrap px-4 py-4 text-zinc-400">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-4 font-semibold text-white">{log.actor_name || "Sistema"}</td>
                    <td className="px-4 py-4 text-zinc-200">{log.description}</td>
                    <td className="px-4 py-4 text-zinc-400">{actionLabel(log.action)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-zinc-400">
            Nenhuma ação registrada ainda.
          </div>
        )}
      </PremiumPanel>
    </MinistryShell>
  );
}
