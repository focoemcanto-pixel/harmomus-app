import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Music2, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string; itemId: string };

function memberLabel(member: any) {
  return member?.invited_name || member?.invited_email || "Integrante";
}

export default async function SongSettingsPage({ params }: { params: Promise<PageParams> }) {
  const [context, resolvedParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;

  const [{ data: repertoire }, { data: item }, { data: scaleAssignments }, { data: members }] = await Promise.all([
    admin
      .from("ministry_repertoires")
      .select("id,name,archived,ministry_id")
      .eq("id", resolvedParams.id)
      .eq("ministry_id", context.ministry.ministryId)
      .maybeSingle(),
    admin
      .from("ministry_repertoire_items")
      .select("id,kit_id,position,kits(id,slug,name,artist,cover_url)")
      .eq("id", resolvedParams.itemId)
      .eq("repertoire_id", resolvedParams.id)
      .maybeSingle(),
    admin
      .from("ministry_repertoire_assignments")
      .select("member_id,assigned_voice,notes")
      .eq("repertoire_id", resolvedParams.id)
      .is("repertoire_item_id", null),
    admin
      .from("ministry_members")
      .select("id,invited_name,invited_email,status")
      .eq("ministry_id", context.ministry.ministryId),
  ]);

  if (!repertoire?.id || repertoire.archived || !item?.id) notFound();

  const activeMembers = (members ?? []).filter((member: any) => member.status !== "removed");
  const membersById = new Map(activeMembers.map((member: any) => [member.id, member]));
  const rows = (scaleAssignments ?? []).map((assignment: any) => ({
    member: membersById.get(assignment.member_id),
    voice: assignment.assigned_voice,
    notes: assignment.notes,
  })).filter((row: any) => Boolean(row.member));

  const kit = item.kits;

  return (
    <MinistryShell>
      <Link href={`/ministerio/repertorios/${repertoire.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
        <ArrowLeft className="h-4 w-4" /> Voltar para escala
      </Link>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
          <Music2 className="h-4 w-4" /> Configuração da música
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{kit?.name || "Música"}</h1>
        <p className="mt-3 text-sm text-zinc-300">{kit?.artist || "Kit vocal"} · {repertoire.name}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <PremiumPanel>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Tom da música</p>
          <h2 className="mt-2 text-2xl font-semibold">Próxima etapa</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300">Aqui ficará o campo de tom definido para a equipe. O tom pertence à música, não à equipe.</p>
        </PremiumPanel>

        <PremiumPanel>
          <div className="flex items-start gap-4">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><Users className="h-5 w-5" /></div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Vocais da música</p>
              <h2 className="mt-2 text-2xl font-semibold">Nipe por vocalista</h2>
              <p className="mt-2 text-sm text-zinc-400">Cada vocalista receberá seu nipe específico ao estudar esta música.</p>
            </div>
          </div>
          <div className="mt-6 grid gap-3">
            {rows.length ? rows.map((row: any) => (
              <div key={row.member.id} className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <h3 className="text-lg font-semibold text-white">{memberLabel(row.member)}</h3>
                <p className="mt-1 text-sm text-zinc-400">Nipe padrão da escala: {row.voice || "não definido"}</p>
              </div>
            )) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">
                Adicione vocalistas na escala antes de configurar esta música.
              </div>
            )}
          </div>
        </PremiumPanel>
      </div>
    </MinistryShell>
  );
}
