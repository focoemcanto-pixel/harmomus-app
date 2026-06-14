import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Save } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getActivityActorName, logMinistryActivity } from "@/lib/data/ministry-activity";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = { error?: string | string[] };

function value(input?: string | string[]) {
  return Array.isArray(input) ? input[0] ?? "" : input ?? "";
}

function memberLabel(member: any) {
  return member?.invited_name || member?.invited_email || "Integrante";
}

async function createScale(formData: FormData) {
  "use server";

  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const eventDate = String(formData.get("event_date") ?? "").trim();
  const teamTemplateId = String(formData.get("team_template_id") ?? "").trim();
  const coordinatorMemberId = String(formData.get("coordinator_member_id") ?? "").trim();
  const generalNotes = String(formData.get("general_notes") ?? "").trim();

  if (!name) redirect("/ministerio/repertorios/novo?error=Informe%20o%20nome%20da%20escala");

  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();
  let templateMembers: any[] = [];
  let resolvedCoordinatorId = coordinatorMemberId || null;

  if (teamTemplateId) {
    const { data: template } = await admin
      .from("ministry_team_templates")
      .select("id,coordinator_member_id")
      .eq("id", teamTemplateId)
      .eq("ministry_id", context.ministry.ministryId)
      .eq("archived", false)
      .maybeSingle();

    if (template?.id) {
      resolvedCoordinatorId = resolvedCoordinatorId || template.coordinator_member_id || null;
      const { data: members } = await admin
        .from("ministry_team_template_members")
        .select("member_id,assigned_role,assigned_voice,assigned_tone,notes")
        .eq("template_id", template.id);
      templateMembers = members ?? [];
    }
  }

  const finalDescription = [description, generalNotes ? `Observação geral: ${generalNotes}` : ""].filter(Boolean).join("\n\n") || null;

  const { data, error } = await admin
    .from("ministry_repertoires")
    .insert({
      ministry_id: context.ministry.ministryId,
      name,
      description: finalDescription,
      event_date: eventDate || null,
      team_template_id: teamTemplateId || null,
      coordinator_member_id: resolvedCoordinatorId,
      status: "scheduled",
      created_by: context.profile?.id ?? null,
      archived: false,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    const message = encodeURIComponent(error?.message || "Não foi possível criar a escala.");
    redirect(`/ministerio/repertorios/novo?error=${message}`);
  }

  if (templateMembers.length) {
    await admin.from("ministry_repertoire_assignments").insert(
      templateMembers.map((member) => ({
        repertoire_id: data.id,
        repertoire_item_id: null,
        kit_id: null,
        member_id: member.member_id,
        assigned_role: member.assigned_role || null,
        assigned_voice: member.assigned_voice || null,
        assigned_tone: member.assigned_tone || null,
        notes: member.notes || null,
        study_mode: "voice",
        created_at: now,
        updated_at: now,
      })),
    );
  }

  const actorName = getActivityActorName(context.profile);
  await logMinistryActivity({
    ministryId: context.ministry.ministryId,
    actorUserId: context.profile?.id ?? null,
    actorName,
    action: "scale.created",
    entityType: "ministry_repertoire",
    entityId: data.id,
    description: `${actorName} criou a escala ${name}`,
    metadata: { repertoire_id: data.id, name, description: finalDescription, event_date: eventDate || null },
  });

  redirect(`/ministerio/repertorios/${data.id}`);
}

export default async function NovoRepertorioPage({ searchParams }: { searchParams?: Promise<SearchParams> | SearchParams }) {
  const [context, rawParams] = await Promise.all([
    getCurrentUserAccessContext(),
    Promise.resolve(searchParams ?? {}),
  ]);

  const errorMessage = value(rawParams.error);
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const [{ data: teamTemplates }, { data: members }] = await Promise.all([
    admin.from("ministry_team_templates").select("id,name").eq("ministry_id", context.ministry.ministryId).eq("archived", false).order("created_at", { ascending: false }),
    admin.from("ministry_members").select("id,invited_name,invited_email").eq("ministry_id", context.ministry.ministryId).eq("status", "active").order("created_at", { ascending: true }),
  ]);

  return (
    <MinistryShell>
      <Link href="/ministerio/repertorios" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
        <ArrowLeft className="h-4 w-4" /> Voltar para escalas
      </Link>

      <PremiumPanel>
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              <CalendarDays className="h-4 w-4" /> Nova escala ministerial
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Monte uma escala completa</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300 md:text-base">Crie a escala do culto, selecione uma equipe pronta e defina o coordenador vocal.</p>
          </div>

          <form action={createScale} className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
            {errorMessage ? <div className="mb-5 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">{errorMessage}</div> : null}

            <label className="block"><span className="text-sm font-semibold text-zinc-200">Nome da escala</span><input name="name" required maxLength={120} placeholder="Ex.: Culto Domingo Manhã" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
            <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Data do culto/evento</span><input type="date" name="event_date" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50" /></label>
            <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Equipe/template</span><select name="team_template_id" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"><option value="">Sem equipe pronta</option>{(teamTemplates ?? []).map((team: any) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Coordenador vocal</span><select name="coordinator_member_id" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"><option value="">Usar coordenador do template ou definir depois</option>{(members ?? []).map((member: any) => <option key={member.id} value={member.id}>{memberLabel(member)}</option>)}</select></label>
            <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Descrição</span><textarea name="description" rows={3} maxLength={500} placeholder="Ex.: Louvor da manhã, ensaio quinta-feira às 19h." className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
            <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Observação geral da escala</span><textarea name="general_notes" rows={3} maxLength={700} placeholder="Ex.: Coordenador deve revisar entradas e liberar estudo até sexta." className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5">
              <Link href="/ministerio/repertorios" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">Cancelar</Link>
              <button className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><Save className="h-4 w-4" /> Salvar escala</button>
            </div>
          </form>
        </div>
      </PremiumPanel>
    </MinistryShell>
  );
}
