import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string };

type MinistryMember = {
  id: string;
  invited_name: string | null;
  invited_email: string | null;
};

type TeamMember = {
  id: string;
  member_id: string;
  assigned_role: string | null;
  assigned_voice: string | null;
  assigned_tone: string | null;
  notes: string | null;
};

function getMemberName(member?: MinistryMember | null) {
  return member?.invited_name || member?.invited_email || "Integrante";
}

export default async function MinistryTeamDetailPage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const templateId = resolvedParams.id;

  const [{ data: template, error: templateError }, { data: members, error: membersError }, { data: teamMembers, error: teamMembersError }] = await Promise.all([
    admin
      .from("ministry_team_templates")
      .select("id,name,description,coordinator_member_id")
      .eq("id", templateId)
      .eq("ministry_id", context.ministry.ministryId)
      .eq("archived", false)
      .maybeSingle(),
    admin
      .from("ministry_members")
      .select("id,invited_name,invited_email")
      .eq("ministry_id", context.ministry.ministryId)
      .eq("status", "active"),
    admin
      .from("ministry_team_template_members")
      .select("id,member_id,assigned_role,assigned_voice,assigned_tone,notes")
      .eq("template_id", templateId)
      .order("created_at", { ascending: true }),
  ]);

  if (templateError) throw new Error(templateError.message);
  if (membersError) throw new Error(membersError.message);
  if (teamMembersError) throw new Error(teamMembersError.message);
  if (!template?.id) notFound();

  const membersById = new Map((members ?? []).map((member: MinistryMember) => [member.id, member]));
  const coordinator = template.coordinator_member_id ? membersById.get(template.coordinator_member_id) : null;
  const rows = (teamMembers ?? []) as TeamMember[];

  return (
    <MinistryShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/ministerio/equipes" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Voltar para equipes
        </Link>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <Users className="h-4 w-4" /> Template de equipe
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{template.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{template.description || "Equipe sem descrição."}</p>
        <p className="mt-5 text-sm text-cyan-100">Coordenador vocal padrão: {getMemberName(coordinator)}</p>
      </div>

      <PremiumPanel>
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Integrantes configurados</p>
        <h2 className="mt-2 text-2xl font-semibold">{rows.length} integrante{rows.length === 1 ? "" : "s"} nesta equipe</h2>

        <div className="mt-6 grid gap-3">
          {rows.length ? rows.map((item) => {
            const member = membersById.get(item.member_id);
            return (
              <div key={item.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <h3 className="text-xl font-semibold text-white">{getMemberName(member)}</h3>
                <p className="mt-1 text-xs text-zinc-500">{member?.invited_email}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-zinc-200">Função: {item.assigned_role || "—"}</span>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">Voz: {item.assigned_voice || "—"}</span>
                  <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-1 text-fuchsia-100">Tom: {item.assigned_tone || "—"}</span>
                </div>
                {item.notes ? <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-300">{item.notes}</p> : null}
              </div>
            );
          }) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">
              Esta equipe ainda não tem integrantes configurados.
            </div>
          )}
        </div>
      </PremiumPanel>
    </MinistryShell>
  );
}
