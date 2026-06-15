import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { ScaleCreateForm } from "@/components/ministerio/scale-create-form";
import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = { error?: string | string[] };
function value(input?: string | string[]) { return Array.isArray(input) ? input[0] ?? "" : input ?? ""; }
function memberLabel(member: any) { return member?.invited_name || member?.invited_email || "Integrante"; }

export default async function NovoRepertorioPage({ searchParams }: { searchParams?: Promise<SearchParams> | SearchParams }) {
  const [context, rawParams] = await Promise.all([getCurrentUserAccessContext(), Promise.resolve(searchParams ?? {})]);
  const errorMessage = value(rawParams.error);
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const [{ data: teamTemplates }, { data: members }] = await Promise.all([
    admin.from("ministry_team_templates").select("id,name").eq("ministry_id", context.ministry.ministryId).eq("archived", false).order("created_at", { ascending: false }),
    admin.from("ministry_members").select("id,invited_name,invited_email").eq("ministry_id", context.ministry.ministryId).eq("status", "active").order("created_at", { ascending: true }),
  ]);
  const teamOptions = (teamTemplates ?? []).map((team: any) => ({ id: team.id, label: team.name }));
  const memberOptions = (members ?? []).map((member: any) => ({ id: member.id, label: memberLabel(member) }));

  return (
    <MinistryShell>
      <Link prefetch href="/ministerio/repertorios" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"><ArrowLeft className="h-4 w-4" /> Voltar para escalas</Link>
      <PremiumPanel>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]"><div><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><CalendarDays className="h-4 w-4" /> Nova escala ministerial</div><h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Monte uma escala completa</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300 md:text-base">Crie a escala do culto, selecione uma equipe pronta e defina o coordenador vocal.</p></div><ScaleCreateForm teams={teamOptions} members={memberOptions} initialError={errorMessage} /></div>
      </PremiumPanel>
    </MinistryShell>
  );
}
