import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Music2, Save, Users } from "lucide-react";

import { MinistryShell, PremiumPanel } from "@/components/ministerio/ministry-ui";
import { MinistrySubmitButton } from "@/components/ministerio/ministry-submit-button";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string; itemId: string };
type PageSearchParams = { message?: string | string[] };

const VOICES = [["", "Usar padrão da escala"], ["lead", "Lead"], ["tenor", "Tenor"], ["contralto", "Contralto"], ["soprano", "Soprano"], ["baritono", "Barítono"], ["baixo", "Baixo"]] as const;

function memberLabel(member: any) {
  return member?.invited_name || member?.invited_email || "Integrante";
}

function backPath(repertoireId: string, itemId: string, message?: string) {
  return `/ministerio/repertorios/${repertoireId}/musicas/${itemId}${message ? `?message=${encodeURIComponent(message)}` : ""}`;
}

async function saveSongSettings(formData: FormData) {
  "use server";

  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const repertoireId = String(formData.get("repertoire_id") ?? "").trim();
  const itemId = String(formData.get("item_id") ?? "").trim();
  const keyOverride = String(formData.get("key_override") ?? "").trim();
  const itemNotes = String(formData.get("item_notes") ?? "").trim();
  if (!repertoireId || !itemId) redirect("/ministerio/repertorios");

  const admin = createSupabaseAdminClient() as any;
  const { data: repertoire } = await admin.from("ministry_repertoires").select("id,ministry_id,archived").eq("id", repertoireId).eq("ministry_id", context.ministry.ministryId).maybeSingle();
  if (!repertoire?.id || repertoire.archived) notFound();

  const { data: item } = await admin.from("ministry_repertoire_items").select("id,repertoire_id").eq("id", itemId).eq("repertoire_id", repertoireId).maybeSingle();
  if (!item?.id) notFound();

  await admin.from("ministry_repertoire_items").update({ key_override: keyOverride || null, notes: itemNotes || null }).eq("id", itemId).eq("repertoire_id", repertoireId);

  const memberIds = formData.getAll("member_id").map((value) => String(value).trim()).filter(Boolean);
  for (const memberId of memberIds) {
    const assignedVoice = String(formData.get(`voice_${memberId}`) ?? "").trim();
    const notes = String(formData.get(`notes_${memberId}`) ?? "").trim();
    const { data: existing } = await admin.from("ministry_repertoire_assignments").select("id").eq("repertoire_id", repertoireId).eq("repertoire_item_id", itemId).eq("member_id", memberId).maybeSingle();
    const payload = { repertoire_id: repertoireId, repertoire_item_id: itemId, member_id: memberId, assigned_voice: assignedVoice || null, notes: notes || null };
    if (existing?.id) await admin.from("ministry_repertoire_assignments").update(payload).eq("id", existing.id);
    else await admin.from("ministry_repertoire_assignments").insert(payload);
  }

  revalidatePath(`/ministerio/repertorios/${repertoireId}`);
  revalidatePath(`/ministerio/repertorios/${repertoireId}/musicas/${itemId}`);
  redirect(backPath(repertoireId, itemId, "Configurações da música salvas."));
}

export default async function SongSettingsPage({ params, searchParams }: { params: Promise<PageParams>; searchParams?: Promise<PageSearchParams> }) {
  const [context, resolvedParams] = await Promise.all([
    getCurrentUserAccessContext(),
    params,
    searchParams ?? Promise.resolve({} as PageSearchParams),
  ]);

  if (context.isGuest) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");

  const admin = createSupabaseAdminClient() as any;

  const [{ data: repertoire }, itemResult, { data: scaleAssignments }, { data: songAssignments }, { data: members }] = await Promise.all([
    admin.from("ministry_repertoires").select("id,name,archived,ministry_id").eq("id", resolvedParams.id).eq("ministry_id", context.ministry.ministryId).maybeSingle(),
    admin.from("ministry_repertoire_items").select("id,kit_id,position,key_override,notes,kits(id,slug,name,artist,cover_url)").eq("id", resolvedParams.itemId).eq("repertoire_id", resolvedParams.id).maybeSingle(),
    admin.from("ministry_repertoire_assignments").select("member_id,assigned_voice,notes").eq("repertoire_id", resolvedParams.id).is("repertoire_item_id", null),
    admin.from("ministry_repertoire_assignments").select("member_id,assigned_voice,notes").eq("repertoire_id", resolvedParams.id).eq("repertoire_item_id", resolvedParams.itemId),
    admin.from("ministry_members").select("id,invited_name,invited_email,status").eq("ministry_id", context.ministry.ministryId),
  ]);

  let item = itemResult.data;
  if (itemResult.error) {
    const fallback = await admin.from("ministry_repertoire_items").select("id,kit_id,position,kits(id,slug,name,artist,cover_url)").eq("id", resolvedParams.itemId).eq("repertoire_id", resolvedParams.id).maybeSingle();
    item = fallback.data;
  }

  if (!repertoire?.id || repertoire.archived || !item?.id) notFound();

  const activeMembers = (members ?? []).filter((member: any) => member.status !== "removed");
  const membersById = new Map(activeMembers.map((member: any) => [member.id, member]));
  const songMap = new Map((songAssignments ?? []).map((assignment: any) => [assignment.member_id, assignment]));
  const rows = (scaleAssignments ?? []).map((assignment: any) => ({
    member: membersById.get(assignment.member_id),
    voice: assignment.assigned_voice,
    notes: assignment.notes,
    song: songMap.get(assignment.member_id),
  })).filter((row: any) => Boolean(row.member));

  const kit = item.kits;
  const itemKey = "key_override" in item ? item.key_override : "";
  const itemNotes = "notes" in item ? item.notes : "";

  return (
    <MinistryShell>
      <Link prefetch href={`/ministerio/repertorios/${repertoire.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
        <ArrowLeft className="h-4 w-4" /> Voltar para escala
      </Link>

      <div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><Music2 className="h-4 w-4" /> Configuração da música</div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{kit?.name || "Música"}</h1>
        <p className="mt-3 text-sm text-zinc-300">{kit?.artist || "Kit vocal"} · {repertoire.name}</p>
      </div>

      <form action={saveSongSettings} className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <input type="hidden" name="repertoire_id" value={repertoire.id} />
        <input type="hidden" name="item_id" value={item.id} />
        <PremiumPanel>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Tom da música</p>
          <h2 className="mt-2 text-2xl font-semibold">Tom exibido para equipe</h2>
          <label className="mt-6 block"><span className="text-sm font-semibold text-zinc-200">Tom definido</span><input name="key_override" defaultValue={itemKey ?? ""} maxLength={30} placeholder="Ex.: Original, A, Bb, C" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
          <label className="mt-4 block"><span className="text-sm font-semibold text-zinc-200">Observação da música</span><textarea name="item_notes" defaultValue={itemNotes ?? ""} rows={4} maxLength={600} placeholder="Ex.: Atenção à entrada da ponte." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
        </PremiumPanel>

        <PremiumPanel>
          <div className="flex items-start gap-4"><div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><Users className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Vocais da música</p><h2 className="mt-2 text-2xl font-semibold">Nipe por vocalista</h2><p className="mt-2 text-sm text-zinc-400">Cada vocalista receberá seu nipe específico ao estudar esta música.</p></div></div>
          <div className="mt-6 grid gap-3">
            {rows.length ? rows.map((row: any) => {
              const defaultVoice = row.song?.assigned_voice ?? row.voice ?? "";
              const defaultNotes = row.song?.notes ?? "";
              return <div key={row.member.id} className="rounded-3xl border border-white/10 bg-black/20 p-5"><input type="hidden" name="member_id" value={row.member.id} /><h3 className="text-lg font-semibold text-white">{memberLabel(row.member)}</h3><p className="mt-1 text-sm text-zinc-400">Nipe padrão da escala: {row.voice || "não definido"}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><label><span className="text-sm font-semibold text-zinc-200">Nipe nesta música</span><select name={`voice_${row.member.id}`} defaultValue={defaultVoice} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label><span className="text-sm font-semibold text-zinc-200">Observação individual</span><input name={`notes_${row.member.id}`} defaultValue={defaultNotes} maxLength={300} placeholder="Ex.: entra no refrão" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label></div></div>;
            }) : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Adicione vocalistas na escala antes de configurar esta música.</div>}
          </div>
          <MinistrySubmitButton pendingText="Salvando configuração..." className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><Save className="h-4 w-4" /> Salvar configuração da música</MinistrySubmitButton>
        </PremiumPanel>
      </form>
    </MinistryShell>
  );
}
