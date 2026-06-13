import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowRight, Plus, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageSearchParams = { message?: string | string[] };

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

export default async function MinistryTeamsPage({ searchParams }: { searchParams?: Promise<PageSearchParams> }) {
  const [context, params] = await Promise.all([
    getCurrentUserAccessContext(),
    searchParams ?? Promise.resolve({} as PageSearchParams),
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const rawMessage = params.message;
  const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage;

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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Nova equipe</p>
              <h2 className="mt-1 text-2xl font-semibold">Criar template</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Defina nome, descrição e coordenador. Você adiciona os integrantes na próxima tela.</p>
            </div>
          </div>

          <form action={createTeamTemplate} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">Nome da equipe</span>
              <input name="name" required placeholder="Ex.: Grupo Domingo Manhã" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none ring-cyan-300/30 transition placeholder:text-zinc-500 focus:ring" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">Descrição</span>
              <textarea name="description" rows={3} placeholder="Ex.: Equipe fixa dos domingos pela manhã" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none ring-cyan-300/30 transition placeholder:text-zinc-500 focus:ring" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-zinc-200">Coordenador vocal</span>
              <select name="coordinator_member_id" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none ring-cyan-300/30 transition focus:ring">
                <option value="">Sem coordenador</option>
                {activeMembers.map((member) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}
              </select>
            </label>
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-4 font-bold text-slate-950 transition hover:scale-[1.01]">
              Criar equipe <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </PremiumPanel>

        <PremiumPanel>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Templates salvos</p>
          <h2 className="mt-1 text-2xl font-semibold">Suas equipes</h2>
          <div className="mt-6 space-y-3">
            {rows.length ? rows.map((template) => {
              const coordinator = membersById.get(template.coordinator_member_id ?? "");
              return <Link key={template.id} href={`/ministerio/equipes/${template.id}`} className="block rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 transition hover:border-cyan-300/40 hover:bg-white/[0.07]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{template.name}</h3>
                    <p className="mt-1 text-sm text-zinc-400">{template.description || "Sem descrição"}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-cyan-200" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-300">
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">{counts.get(template.id) ?? 0} integrantes</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">Coordenador: {memberLabel(coordinator)}</span>
                </div>
              </Link>;
            }) : <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm text-zinc-300">Nenhuma equipe criada ainda.</p>}
          </div>
        </PremiumPanel>
      </div>
    </MinistryShell>
  );
}
