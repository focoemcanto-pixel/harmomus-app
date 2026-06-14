import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus, Users } from "lucide-react";

import { MinistryRouteTransition } from "@/components/ministerio/ministry-route-transition";
import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { TeamCreateForm } from "@/components/ministerio/team-create-form";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageSearchParams = Record<string, string | string[] | undefined>;

function isSchemaMissing(message?: string | null) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find");
}

function memberLabel(member: any) {
  return member?.invited_name || member?.invited_email || "Integrante";
}

function getParam(params: PageSearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function MinistryTeamsPage({ searchParams }: { searchParams?: Promise<PageSearchParams> | PageSearchParams }) {
  const [context, resolvedSearchParams] = await Promise.all([
    getCurrentUserAccessContext(),
    Promise.resolve(searchParams ?? {}),
  ]);
  const params = (resolvedSearchParams ?? {}) as PageSearchParams;

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const [{ data: teams, error }, { data: members }] = await Promise.all([
    admin
      .from("ministry_team_templates")
      .select("id,name,description,created_at")
      .eq("ministry_id", context.ministry.ministryId)
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    admin
      .from("ministry_members")
      .select("id,invited_name,invited_email,status")
      .eq("ministry_id", context.ministry.ministryId)
      .order("created_at", { ascending: true }),
  ]);

  const rawMessage = getParam(params, "message");
  const schemaNotReady = isSchemaMissing(error?.message);
  if (error && !schemaNotReady) throw new Error(error.message);
  const activeMembers = (members ?? []).filter((member: any) => member.status !== "removed");
  const memberOptions = activeMembers.map((member: any) => ({ id: member.id, label: memberLabel(member) }));

  return (
    <MinistryShell>
      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <Users className="h-4 w-4" /> Equipes ministeriais
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Templates de equipe</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">
          Crie grupos como Grupo A, Grupo Verde ou Domingo Manhã para reutilizar formações vocais nas escalas.
        </p>
      </div>

      {rawMessage ? <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">{rawMessage}</div> : null}

      {schemaNotReady ? (
        <PremiumPanel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Configuração pendente</p>
          <h2 className="mt-2 text-2xl font-semibold">Banco ainda não reconheceu as tabelas de equipes</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Aplique a migration `20260613_ministry_team_templates_and_schedules.sql` no Supabase e recarregue o schema.
          </p>
        </PremiumPanel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <PremiumPanel>
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><Plus className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Nova equipe</p>
                <h2 className="mt-2 text-2xl font-semibold">Criar equipe vocal</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Depois de criar, você monta os vocalistas e nipes padrão.</p>
              </div>
            </div>
            <TeamCreateForm members={memberOptions} />
          </PremiumPanel>

          <PremiumPanel>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Templates salvos</p>
            <h2 className="mt-2 text-2xl font-semibold">Suas equipes</h2>
            <div className="mt-6 grid gap-3">
              {(teams ?? []).length ? (teams ?? []).map((team: any) => (
                <MinistryRouteTransition href={`/ministerio/equipes/${team.id}`} key={team.id} className="block rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-cyan-300/40 hover:bg-white/[0.055] data-[pending=true]:border-cyan-300/50 data-[pending=true]:bg-cyan-400/10">
                  <div className="flex items-center justify-between gap-4">
                    <div><h3 className="text-lg font-semibold text-white">{team.name}</h3><p className="mt-2 text-sm text-zinc-400">{team.description || "Sem descrição"}</p></div>
                    <ArrowRight className="h-5 w-5 text-cyan-200" />
                  </div>
                </MinistryRouteTransition>
              )) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">
                  Nenhuma equipe criada ainda.
                </div>
              )}
            </div>
          </PremiumPanel>
        </div>
      )}
    </MinistryShell>
  );
}
