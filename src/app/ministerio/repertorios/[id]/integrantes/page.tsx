import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Save, UserPlus, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string };
type PageSearchParams = { message?: string | string[] };

const VOICES = [
  ["", "Definir por música"],
  ["lead", "Lead"],
  ["tenor", "Tenor"],
  ["contralto", "Contralto"],
  ["soprano", "Soprano"],
  ["baritono", "Barítono"],
  ["baixo", "Baixo"],
] as const;

function label(member: any) {
  return member?.invited_name || member?.invited_email || "Integrante";
}

function email(member: any) {
  return member?.invited_email || "";
}

function backPath(repertoireId: string, message?: string) {
  const suffix = message ? `?message=${encodeURIComponent(message)}` : "";
  return `/ministerio/repertorios/${repertoireId}/integrantes${suffix}`;
}

async function saveAssignment(formData: FormData) {
  "use server";

  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const repertoireId = String(formData.get("repertoire_id") ?? "").trim();
  const memberId = String(formData.get("member_id") ?? "").trim();
  const assignedVoice = String(formData.get("assigned_voice") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!repertoireId || !memberId) redirect("/ministerio/repertorios");

  const admin = createSupabaseAdminClient() as any;

  const { data: repertoire } = await admin
    .from("ministry_repertoires")
    .select("id,ministry_id,archived")
    .eq("id", repertoireId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (!repertoire?.id || repertoire.archived) notFound();

  const { data: member } = await admin
    .from("ministry_members")
    .select("id")
    .eq("id", memberId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (!member?.id) redirect(backPath(repertoireId, "Integrante inválido para este ministério."));

  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("ministry_repertoire_assignments")
    .select("id")
    .eq("repertoire_id", repertoireId)
    .eq("member_id", memberId)
    .is("repertoire_item_id", null)
    .maybeSingle();

  const payload = {
    repertoire_id: repertoireId,
    repertoire_item_id: null,
    kit_id: null,
    member_id: memberId,
    assigned_role: "vocal",
    assigned_voice: assignedVoice || null,
    assigned_tone: null,
    study_mode: "voice",
    notes: notes || null,
    updated_at: now,
  };

  const response = existing?.id
    ? await admin.from("ministry_repertoire_assignments").update(payload).eq("id", existing.id)
    : await admin.from("ministry_repertoire_assignments").insert({ ...payload, created_at: now });

  if (response.error) redirect(backPath(repertoireId, response.error.message));

  revalidatePath(`/ministerio/repertorios/${repertoireId}`);
  revalidatePath(`/ministerio/repertorios/${repertoireId}/integrantes`);
  redirect(backPath(repertoireId, "Vocal salvo na escala."));
}

export default async function ScaleMembersPage({ params, searchParams }: { params: Promise<PageParams>; searchParams?: Promise<PageSearchParams> }) {
  const [context, resolvedParams, rawSearchParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
    searchParams ?? Promise.resolve({} as PageSearchParams),
  ]);

  const resolvedSearchParams = rawSearchParams as PageSearchParams;

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;
  const repertoireId = resolvedParams.id;
  const message = Array.isArray(resolvedSearchParams.message) ? resolvedSearchParams.message[0] : resolvedSearchParams.message;

  const [{ data: repertoire }, { data: members }, { data: assignments }] = await Promise.all([
    admin
      .from("ministry_repertoires")
      .select("id,name,event_date,archived,ministry_id")
      .eq("id", repertoireId)
      .eq("ministry_id", context.ministry.ministryId)
      .maybeSingle(),
    admin
      .from("ministry_members")
      .select("id,invited_name,invited_email,status")
      .eq("ministry_id", context.ministry.ministryId)
      .order("created_at", { ascending: true }),
    admin
      .from("ministry_repertoire_assignments")
      .select("id,member_id,assigned_voice,notes")
      .eq("repertoire_id", repertoireId)
      .is("repertoire_item_id", null)
      .order("created_at", { ascending: true }),
  ]);

  if (!repertoire?.id || repertoire.archived) notFound();

  const memberRows = (members ?? []).filter((member: any) => member.status !== "removed");
  const assignmentRows = assignments ?? [];
  const memberMap = new Map(memberRows.map((member: any) => [member.id, member]));
  const selectedIds = new Set(assignmentRows.map((assignment: any) => assignment.member_id));
  const availableMembers = memberRows.filter((member: any) => !selectedIds.has(member.id));

  return (
    <MinistryShell>
      <Link href={`/ministerio/repertorios/${repertoire.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
        <ArrowLeft className="h-4 w-4" /> Voltar para escala
      </Link>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><Users className="h-4 w-4" /> Vocais da escala</div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{repertoire.name}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">Selecione os vocalistas desta escala. O nipe final e o tom serão ajustados em cada música.</p>
      </div>

      {message ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">{message}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <PremiumPanel>
          <div className="flex items-start gap-4"><div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><UserPlus className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Adicionar vocal</p><h2 className="mt-2 text-2xl font-semibold">Participantes da escala</h2></div></div>
          <form action={saveAssignment} className="mt-6 space-y-4">
            <input type="hidden" name="repertoire_id" value={repertoire.id} />
            <label className="block"><span className="text-sm font-semibold text-zinc-200">Integrante</span><select name="member_id" required className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"><option value="">Selecione</option>{availableMembers.map((member: any) => <option key={member.id} value={member.id}>{label(member)}</option>)}</select></label>
            <label className="block"><span className="text-sm font-semibold text-zinc-200">Nipe padrão nesta escala</span><select name="assigned_voice" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
            <label className="block"><span className="text-sm font-semibold text-zinc-200">Observação para a escala</span><textarea name="notes" rows={4} maxLength={700} placeholder="Ex.: Vocalista fará tenor como base, mas pode mudar por música." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><Save className="h-4 w-4" /> Salvar vocal na escala</button>
          </form>
        </PremiumPanel>

        <PremiumPanel>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Vocais atuais</p>
          <h2 className="mt-2 text-2xl font-semibold">{assignmentRows.length} configurado{assignmentRows.length === 1 ? "" : "s"}</h2>
          <div className="mt-6 grid gap-3">
            {assignmentRows.length ? assignmentRows.map((assignment: any) => {
              const member = memberMap.get(assignment.member_id);
              return <div key={assignment.id} className="rounded-3xl border border-white/10 bg-black/20 p-5"><h3 className="text-lg font-semibold text-white">{label(member)}</h3><p className="mt-1 text-xs text-zinc-500">{email(member)}</p><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">Nipe padrão: {assignment.assigned_voice || "Definir por música"}</span></div>{assignment.notes ? <p className="mt-4 text-sm leading-6 text-zinc-300">{assignment.notes}</p> : null}</div>;
            }) : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Nenhum vocal configurado ainda.</div>}
          </div>
        </PremiumPanel>
      </div>
    </MinistryShell>
  );
}
