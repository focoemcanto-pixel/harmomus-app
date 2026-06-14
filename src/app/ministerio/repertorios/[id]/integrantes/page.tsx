import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

import { ScaleMembersManager } from "@/components/ministerio/scale-members-manager";
import { MinistryShell } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string };
type Member = { id: string; invited_name: string | null; invited_email: string | null; status?: string | null };
type Assignment = { id: string; member_id: string; assigned_voice: string | null; notes: string | null };

export default async function ScaleMembersPage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([getCurrentUserAccessContext(), params]);
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const repertoireId = resolvedParams.id;
  const [{ data: repertoire }, { data: members }, { data: assignments }] = await Promise.all([
    admin.from("ministry_repertoires").select("id,name,event_date,archived,ministry_id").eq("id", repertoireId).eq("ministry_id", context.ministry.ministryId).maybeSingle(),
    admin.from("ministry_members").select("id,invited_name,invited_email,status").eq("ministry_id", context.ministry.ministryId).order("created_at", { ascending: true }),
    admin.from("ministry_repertoire_assignments").select("id,member_id,assigned_voice,notes").eq("repertoire_id", repertoireId).is("repertoire_item_id", null).order("created_at", { ascending: true }),
  ]);

  if (!repertoire?.id || repertoire.archived) notFound();

  return (
    <MinistryShell>
      <Link prefetch href={`/ministerio/repertorios/${repertoire.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 active:scale-[0.98]"><ArrowLeft className="h-4 w-4" /> Voltar para escala</Link>
      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><Users className="h-4 w-4" /> Vocais da escala</div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{repertoire.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">Selecione os vocalistas desta escala. O nipe final e o tom serão ajustados em cada música.</p>
      </div>
      <ScaleMembersManager repertoireId={repertoire.id} members={(members ?? []) as Member[]} initialAssignments={(assignments ?? []) as Assignment[]} />
    </MinistryShell>
  );
}
