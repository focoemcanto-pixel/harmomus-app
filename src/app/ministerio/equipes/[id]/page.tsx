import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

import { TeamMembersManager } from "@/components/ministerio/team-members-manager";
import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string };
type MinistryMember = { id: string; invited_name: string | null; invited_email: string | null; status?: string | null };
type TeamMember = { id: string; member_id: string; assigned_voice: string | null; notes: string | null };

export default async function MinistryTeamDetailPage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([getCurrentUserAccessContext(), params]);
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const templateId = resolvedParams.id;
  const [{ data: template, error: templateError }, { data: members, error: membersError }, { data: teamMembers, error: teamMembersError }] = await Promise.all([
    admin.from("ministry_team_templates").select("id,name,description,coordinator_member_id").eq("id", templateId).eq("ministry_id", context.ministry.ministryId).eq("archived", false).maybeSingle(),
    admin.from("ministry_members").select("id,invited_name,invited_email,status").eq("ministry_id", context.ministry.ministryId).order("created_at", { ascending: true }),
    admin.from("ministry_team_template_members").select("id,member_id,assigned_voice,notes").eq("template_id", templateId).order("created_at", { ascending: true }),
  ]);

  if (templateError) throw new Error(templateError.message);
  if (membersError) throw new Error(membersError.message);
  if (teamMembersError) throw new Error(teamMembersError.message);
  if (!template?.id) notFound();

  return (
    <MinistryShell>
      <Link prefetch href="/ministerio/equipes" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 active:scale-[0.98]"><ArrowLeft className="h-4 w-4" /> Voltar para equipes</Link>
      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><Users className="h-4 w-4" /> Equipe vocal</div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{template.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{template.description || "Equipe sem descrição."}</p>
      </div>
      <PremiumPanel>
        <TeamMembersManager templateId={template.id} members={(members ?? []) as MinistryMember[]} initialRows={(teamMembers ?? []) as TeamMember[]} initialCoordinatorId={template.coordinator_member_id ?? null} />
      </PremiumPanel>
    </MinistryShell>
  );
}
