import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isSchemaMissing(message?: string | null) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find");
}

export default async function MinistryTeamsPage() {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const { data: teams, error } = await admin
    .from("ministry_team_templates")
    .select("id,name,description,created_at")
    .eq("ministry_id", context.ministry.ministryId)
    .eq("archived", false)
    .order("created_at", { ascending: false });

  const schemaNotReady = isSchemaMissing(error?.message);
  if (error && !schemaNotReady) throw new Error(error.message);

  return (
    <MinistryShell>
      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <Users className="h-4 w-4" /> Equipes ministeriais
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Templates de equipe</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">
          Crie grupos como Grupo A, Grupo Verde ou Domingo Manhã para reutilizar formações nas escalas.
        </p>
      </div>

      {schemaNotReady ? (
        <PremiumPanel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Configuração pendente</p>
          <h2 className="mt-2 text-2xl font-semibold">Banco ainda não reconheceu as tabelas de equipes</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Aplique a migration `20260613_ministry_team_templates_and_schedules.sql` no Supabase e recarregue o schema. A página foi estabilizada para não derrubar o app enquanto isso.
          </p>
        </PremiumPanel>
      ) : (
        <PremiumPanel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Templates salvos</p>
          <h2 className="mt-2 text-2xl font-semibold">Suas equipes</h2>
          <div className="mt-6 grid gap-3">
            {(teams ?? []).length ? (teams ?? []).map((team: any) => (
              <div key={team.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <h3 className="text-lg font-semibold text-white">{team.name}</h3>
                <p className="mt-2 text-sm text-zinc-400">{team.description || "Sem descrição"}</p>
              </div>
            )) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">
                Nenhuma equipe criada ainda.
              </div>
            )}
          </div>
        </PremiumPanel>
      )}
    </MinistryShell>
  );
}
