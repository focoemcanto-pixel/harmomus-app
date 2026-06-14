import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Music2 } from "lucide-react";

import { SongSettingsForm } from "@/components/ministerio/song-settings-form";
import { MinistryShell } from "@/components/ministerio/ministry-ui";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string; itemId: string };
type PageSearchParams = { message?: string | string[] };

function memberLabel(member: any) { return member?.invited_name || member?.invited_email || "Integrante"; }
function backPath(repertoireId: string, itemId: string, message?: string) { return `/ministerio/repertorios/${repertoireId}/musicas/${itemId}${message ? `?message=${encodeURIComponent(message)}` : ""}`; }
function normalizeTone(value: string | null | undefined) { const raw = String(value ?? "").trim(); if (!raw) return ""; const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/♯/g, "#").replace(/＃/g, "#").replace(/\s+/g, "").toUpperCase(); const flatMap: Record<string, string> = { DB: "C#", EB: "D#", GB: "F#", AB: "G#", BB: "A#" }; return flatMap[normalized] ?? normalized; }
async function getAvailableTones(admin: any, kitId: string): Promise<string[]> { if (!kitId) return []; const { data, error } = await admin.from("kit_audio_files").select("tone,source_type").eq("kit_id", kitId).in("source_type", ["original", "generated"]).order("tone", { ascending: true }); if (error) return []; return Array.from(new Set((data ?? []).map((file: any) => normalizeTone(file.tone)).filter(Boolean))) as string[]; }

async function requestSongTone(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest || !context.profile?.id) redirect("/login");
  if (!context.ministry) redirect("/assinatura");
  if (!isMinistryManager(context)) redirect("/");
  const repertoireId = String(formData.get("repertoire_id") ?? "").trim();
  const itemId = String(formData.get("item_id") ?? "").trim();
  const desiredTone = String(formData.get("desired_tone") ?? "").trim().slice(0, 40);
  const notes = String(formData.get("tone_request_notes") ?? "").trim().slice(0, 1000);
  if (!repertoireId || !itemId) redirect("/ministerio/repertorios");
  if (!desiredTone) redirect(backPath(repertoireId, itemId, "Informe o tom desejado para solicitar."));
  const admin = createSupabaseAdminClient() as any;
  const { data: repertoire } = await admin.from("ministry_repertoires").select("id,ministry_id,archived").eq("id", repertoireId).eq("ministry_id", context.ministry.ministryId).maybeSingle();
  if (!repertoire?.id || repertoire.archived) notFound();
  const { data: item } = await admin.from("ministry_repertoire_items").select("id,kit_id,kits(slug,name,artist)").eq("id", itemId).eq("repertoire_id", repertoireId).maybeSingle();
  if (!item?.id) notFound();
  const kit = Array.isArray(item.kits) ? item.kits[0] : item.kits;
  const { error } = await admin.from("premium_requests").insert({ user_id: context.profile.id, ministry_id: context.ministry.ministryId, request_type: "tone", song_name: kit?.name || "Música da escala", artist_name: kit?.artist || null, kit_slug: kit?.slug || null, desired_tone: normalizeTone(desiredTone) || desiredTone, notes: notes || `Solicitado pela configuração da escala ${repertoireId}.`, status: "pending" });
  if (error) redirect(backPath(repertoireId, itemId, error.message || "Não foi possível solicitar o tom."));
  revalidatePath(`/ministerio/repertorios/${repertoireId}/musicas/${itemId}`);
  redirect(backPath(repertoireId, itemId, "Pedido de tom enviado com sucesso."));
}

export default async function SongSettingsPage({ params, searchParams }: { params: Promise<PageParams>; searchParams?: Promise<PageSearchParams> }) {
  const [context, resolvedParams, resolvedSearchParams] = await Promise.all([getCurrentUserAccessContext(), params, searchParams ?? Promise.resolve({} as PageSearchParams)]);
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
    const fallback = await admin.from("ministry_repertoire_items").select("id,kit_id,position,key_override,kits(id,slug,name,artist,cover_url)").eq("id", resolvedParams.itemId).eq("repertoire_id", resolvedParams.id).maybeSingle();
    item = fallback.data;
  }
  if (!repertoire?.id || repertoire.archived || !item?.id) notFound();
  const activeMembers = (members ?? []).filter((member: any) => member.status !== "removed");
  const membersById = new Map(activeMembers.map((member: any) => [member.id, member]));
  const songMap = new Map((songAssignments ?? []).map((assignment: any) => [assignment.member_id, assignment]));
  const rows = (scaleAssignments ?? []).map((assignment: any) => { const member = membersById.get(assignment.member_id); const song = songMap.get(assignment.member_id) as any; return member ? { memberId: member.id, name: memberLabel(member), defaultVoice: assignment.assigned_voice, defaultNotes: assignment.notes, songVoice: song?.assigned_voice ?? null, songNotes: song?.notes ?? null } : null; }).filter(Boolean);
  const kit = Array.isArray(item.kits) ? item.kits[0] : item.kits;
  const availableTones = await getAvailableTones(admin, item.kit_id);
  const itemKey = "key_override" in item ? normalizeTone(item.key_override) : "";
  const selectedTone = availableTones.includes(itemKey) ? itemKey : "";
  const itemNotes = "notes" in item ? item.notes : "";
  const message = Array.isArray(resolvedSearchParams.message) ? resolvedSearchParams.message[0] : resolvedSearchParams.message;

  return <MinistryShell><Link prefetch href={`/ministerio/repertorios/${repertoire.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 active:scale-[0.98]"><ArrowLeft className="h-4 w-4" /> Voltar para escala</Link>{message ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">{message}</div> : null}<div className="overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120]/95 via-[#140d27]/95 to-[#06111f]/95 p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10"><div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><Music2 className="h-4 w-4" /> Configuração da música</div><h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">{kit?.name || "Música"}</h1><p className="mt-3 text-sm text-zinc-300">{kit?.artist || "Kit vocal"} · {repertoire.name}</p></div><SongSettingsForm repertoireId={repertoire.id} itemId={item.id} availableTones={availableTones} selectedTone={selectedTone} itemNotes={itemNotes ?? ""} rows={rows as any[]} /><form id="request-tone-form" action={requestSongTone}><input type="hidden" name="repertoire_id" value={repertoire.id} /><input type="hidden" name="item_id" value={item.id} /></form></MinistryShell>;
}
