import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowRight, Plus, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamTemplate = {
  id: string;
  name: string;
  description: string | null;
  coordinator_member_id: string | null;
  created_at: string | null;
};

type MinistryMember = {
  id: string;
  invited_name: string | null;
  invited_email: string | null;
  role: string | null;
  status: string | null;
};

function memberLabel(member?: MinistryMember | null) {
  if (!member) return "Sem coordenador";
  return member.invited_name || member.invited_email || "Integrante";
}

async function createTeamTemplate(formData: FormData) {
  "use server";

  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const coordinatorMemberId = String(formData.get("coordinator_member_id") ?? "").trim();

  if (!name) redirect("/ministerio/equipes?message=Informe%20o%20nome%20da%20equipe");

  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("ministry_team_templates")
    .insert({
      ministry_id: context.ministry.ministryId,
      name,
      description: description || null,
      coordinator_member_id: coordinatorMemberId || null,
      created_by: context.profile?.id ?? null,
      archived: false,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    const message = encodeURIComponent(error?.message || "Não foi possível criar a equipe.");
    redirect(`/ministerio/equipes?message=${message}`);
  }

  revalidatePath("/ministerio/equipes");
  redirect(`/ministerio/equipes/${data.id}`);
}

export default async function MinistryTeamsPage({ searchParams }: { searchParams?: Promise<{ message?: string | string[] }> }) {
  const [context, params] = await Promise.all([
    getCurrentUserAccessContext(),
    searchParams ?? Promise.resolve({}),
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const message = Array.isArray(params.message) ? params.message[0] : params.message;

  const [{ data: templates, error: templatesError }, { data: members, error: membersError }, { data: templateMembers }] = await Promise.all([
    admin
      .from("ministry_team_templates")
      .select("id,name,description,coordinator_member_id,created_at")
      .eq("ministry_id", context.ministry.ministryId)
      .eq("archived", false)
      .order("created_at", { ascending: false }),
    admin
      .from("ministry_members")
      .select("id,invited_name,invited_email,role,status")
      .eq("ministry_id", context.ministry.ministryId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    admin
      .from("ministry_team_template_members")
      .select("template_id,member_id"),
  ]);

  if (templatesError) throw new Error(templatesError.message);
  if (membersError) throw new Error(membersError.message);

  const rows = (templates ?? []) as TeamTemplate[];
  const activeMembers = (members ?? []) as MinistryMember[];
  const membersById = new Map(activeMembers.map((member) => [member.id, member]));
  const counts = new Map<string, number>();

  for (const item of templateMembers ?? []) {
    counts.set(String(item.template_id), (counts.get(String(item.template_id)) ?? 0) + 1);
  }

  return (
    <MinistryShell>
      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <Users className="h-4 w-4" /> Equipes ministeriais
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Templates de equipe</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">
          Crie grupos como Grupo A, Grupo Verde ou Domingo Manhã. Depois, ao montar uma escala, você seleciona a equipe e já traz integrantes, funções, nipes e coordenador vocal.
        </p>
      </div>

      {message ? (
        <div className="rounded-[1.5rem] border border-cyan-300/25 bg-cyan-500/10 p-4 text-sm text-cyan-50">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <PremiumPanel>
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100">
              <Plus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Novo template</p>
              <h2 className="mt-2 text-2xl font-semibold">Criar equipe reutilizável</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Use para formações que se repetem. O coordenador pode ser alterado depois em cada escala.
              </p>
            </div>
          </div>

          <form action={createTeamTemplate} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-zinc-200">Nome da equipe</span>
              <input name="name" required maxLength={100} placeholder="Ex.: Grupo Verde" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-zinc-200">Descrição</span>
              <textarea name="description" rows={3} maxLength={400} placeholder="Ex.: Equipe principal dos cultos de domingo à noite." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-zinc-200">Coordenador vocal padrão</span>
              <select name="coordinator_member_id" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">
                <option value="">Definir depois</option>
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.id}>{memberLabel(member)}</option>
                ))}
              </select>
            </label>
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200">
              <Plus className="h-4 w-4" /> Criar equipe
            </button>
          </form>
        </PremiumPanel>

        <PremiumPanel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Templates salvos</p>
              <h2 className="mt-2 text-2xl font-semibold">Equipes prontas para escala</h2>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {rows.length ? rows.map((team) => {
              const coordinator = team.coordinator_member_id ? membersById.get(team.coordinator_member_id) : null;
              return (
                <Link key={team.id} href={`/ministerio/equipes/${team.id}`} className="group rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-cyan-300/40 hover:bg-white/[0.055]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-white">{team.name}</h3>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{team.description || "Sem descrição."}</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-300">
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">{counts.get(team.id) ?? 0} integrante{(counts.get(team.id) ?? 0) === 1 ? "" : "s"}</span>
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">Coord.: {memberLabel(coordinator)}</span>
                      </div>
                    </div>
                    <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-cyan-200 transition group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            }) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">
                Nenhuma equipe criada ainda. Crie o primeiro template para acelerar suas próximas escalas.
              </div>
            )}
          </div>
        </PremiumPanel>
      </div>
    </MinistryShell>
  );
}
