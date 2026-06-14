import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ListMusic, Music2, ShieldCheck } from "lucide-react";

import { MinistryPlaylistPlayer } from "@/components/ministerio/ministry-playlist-player";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageParams = { id: string };
type PageSearchParams = { musica?: string | string[] };

type KitRow = { id: string; slug: string; name: string; artist: string | null; cover_url: string | null };
type RepertoireItem = { id: string; position: number; kit_id?: string | null; key_override?: string | null; notes?: string | null; kits: KitRow | null };
type StudyStatus = "not_studied" | "studied" | "doubt" | "review";
type ProgressRow = { repertoire_item_id: string | null; studied: boolean; studied_at: string | null; study_status?: StudyStatus | null; ready?: boolean | null; ready_at?: string | null };
type AssignmentRow = { id: string; member_id: string; repertoire_item_id: string | null; assigned_voice: string | null; notes?: string | null; study_mode?: string | null };
type MemberRow = { id: string; user_id: string | null; invited_name: string | null; invited_email: string | null; role?: string | null; status?: string | null; profiles?: { full_name: string | null; email: string | null } | null };

const STUDY_STATUSES: StudyStatus[] = ["not_studied", "studied", "doubt", "review"];

function isSchemaMissing(message?: string | null) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find") || text.includes("column");
}

function normalizeStudyStatus(row?: ProgressRow | null): StudyStatus {
  if (row?.study_status && STUDY_STATUSES.includes(row.study_status)) return row.study_status;
  return row?.studied ? "studied" : "not_studied";
}

function statusIsStudied(status: StudyStatus) { return status === "studied"; }
function formatDate(value?: string | null, fallback = "—") { if (!value) return fallback; const date = new Date(value); if (Number.isNaN(date.getTime())) return fallback; return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function memberName(member?: MemberRow | null) { return member?.profiles?.full_name || member?.invited_name || member?.profiles?.email || member?.invited_email || "Integrante"; }
function memberEmail(member?: MemberRow | null) { return member?.profiles?.email || member?.invited_email || ""; }

async function assertRepertoireAccess(input: { admin: any; repertoireId: string; ministryId: string }) {
  const { data: repertoire, error } = await input.admin.from("ministry_repertoires").select("id,ministry_id,archived").eq("id", input.repertoireId).eq("ministry_id", input.ministryId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!repertoire?.id || repertoire.archived) notFound();
  return repertoire;
}

async function safeUpdateProgress(admin: any, id: string, payload: Record<string, unknown>, fallbackPayload: Record<string, unknown>) {
  const { error } = await admin.from("ministry_repertoire_progress").update(payload).eq("id", id);
  if (!error) return;
  if (!isSchemaMissing(error.message)) throw new Error(error.message);
  const fallback = await admin.from("ministry_repertoire_progress").update(fallbackPayload).eq("id", id);
  if (fallback.error) throw new Error(fallback.error.message);
}

async function safeInsertProgress(admin: any, payload: Record<string, unknown>, fallbackPayload: Record<string, unknown>) {
  const { error } = await admin.from("ministry_repertoire_progress").insert(payload);
  if (!error) return;
  if (!isSchemaMissing(error.message)) throw new Error(error.message);
  const fallback = await admin.from("ministry_repertoire_progress").insert(fallbackPayload);
  if (fallback.error) throw new Error(fallback.error.message);
}

async function updateStudyStatus(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry?.ministryId || !context.profile?.id) redirect("/");

  const repertoireId = String(formData.get("repertoire_id") ?? "").trim();
  const itemId = String(formData.get("item_id") ?? "").trim();
  const kitId = String(formData.get("kit_id") ?? "").trim();
  const requestedStatus = String(formData.get("study_status") ?? "not_studied") as StudyStatus;
  const studyStatus = STUDY_STATUSES.includes(requestedStatus) ? requestedStatus : "not_studied";
  const nextStudied = statusIsStudied(studyStatus);
  if (!repertoireId || !itemId || !kitId) redirect("/meus-repertorios");

  const admin = createSupabaseAdminClient() as any;
  await assertRepertoireAccess({ admin, repertoireId, ministryId: context.ministry.ministryId });
  const { data: item, error: itemError } = await admin.from("ministry_repertoire_items").select("id,kit_id,repertoire_id").eq("id", itemId).eq("repertoire_id", repertoireId).maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item?.id) notFound();

  const now = new Date().toISOString();
  const studiedAt = nextStudied ? now : null;
  const { data: existing, error: existingError } = await admin.from("ministry_repertoire_progress").select("id").eq("repertoire_id", repertoireId).eq("repertoire_item_id", itemId).eq("user_id", context.profile.id).maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const basePayload = { studied: nextStudied, studied_at: studiedAt, updated_at: now };
  const richPayload = { ...basePayload, study_status: studyStatus };
  if (existing?.id) await safeUpdateProgress(admin, existing.id, richPayload, basePayload);
  else await safeInsertProgress(admin, { repertoire_id: repertoireId, repertoire_item_id: itemId, kit_id: kitId, user_id: context.profile.id, ready: false, created_at: now, ...richPayload }, { repertoire_id: repertoireId, repertoire_item_id: itemId, kit_id: kitId, user_id: context.profile.id, ready: false, created_at: now, ...basePayload });

  if (!nextStudied) await admin.from("ministry_repertoire_progress").update({ ready: false, ready_at: null, updated_at: now }).eq("repertoire_id", repertoireId).eq("user_id", context.profile.id).is("repertoire_item_id", null).eq("ready", true);
  redirect(`/meus-repertorios/${repertoireId}`);
}

async function toggleReady(formData: FormData) {
  "use server";
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");
  if (!context.ministry?.ministryId || !context.profile?.id) redirect("/");
  const repertoireId = String(formData.get("repertoire_id") ?? "").trim();
  const nextReady = String(formData.get("next_ready") ?? "") === "true";
  if (!repertoireId) redirect("/meus-repertorios");
  const admin = createSupabaseAdminClient() as any;
  await assertRepertoireAccess({ admin, repertoireId, ministryId: context.ministry.ministryId });
  const [{ count: totalItems }, { count: studiedItems }] = await Promise.all([
    admin.from("ministry_repertoire_items").select("id", { count: "exact", head: true }).eq("repertoire_id", repertoireId),
    admin.from("ministry_repertoire_progress").select("id", { count: "exact", head: true }).eq("repertoire_id", repertoireId).eq("user_id", context.profile.id).eq("studied", true).not("repertoire_item_id", "is", null),
  ]);
  const canConfirmReady = Number(totalItems ?? 0) > 0 && Number(studiedItems ?? 0) >= Number(totalItems ?? 0);
  if (nextReady && !canConfirmReady) redirect(`/meus-repertorios/${repertoireId}`);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin.from("ministry_repertoire_progress").select("id").eq("repertoire_id", repertoireId).eq("user_id", context.profile.id).is("repertoire_item_id", null).maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const payload = { ready: nextReady, ready_at: nextReady ? now : null, updated_at: now };
  if (existing?.id) { const { error } = await admin.from("ministry_repertoire_progress").update(payload).eq("id", existing.id); if (error) throw new Error(error.message); }
  else { const { error } = await admin.from("ministry_repertoire_progress").insert({ repertoire_id: repertoireId, repertoire_item_id: null, kit_id: null, user_id: context.profile.id, studied: false, studied_at: null, created_at: now, ...payload }); if (error) throw new Error(error.message); }
  redirect(`/meus-repertorios/${repertoireId}`);
}

function mergeItemsWithKits(items: any[] | null | undefined, kits: KitRow[] | null | undefined) {
  const kitsById = new Map((kits ?? []).map((kit) => [String(kit.id), kit]));
  return (items ?? []).map((item: any) => ({ id: item.id, position: Number(item.position ?? 0), kit_id: item.kit_id ?? null, key_override: item.key_override ?? null, notes: item.notes ?? null, kits: item.kit_id ? kitsById.get(String(item.kit_id)) ?? null : null })) as RepertoireItem[];
}

async function loadRepertoireItems(admin: any, repertoireId: string) {
  const rich = await admin.from("ministry_repertoire_items").select("id,position,kit_id,key_override,notes").eq("repertoire_id", repertoireId).order("position", { ascending: true });
  if (!rich.error) return rich.data ?? [];
  if (!isSchemaMissing(rich.error.message)) throw new Error(rich.error.message);
  const basic = await admin.from("ministry_repertoire_items").select("id,position,kit_id").eq("repertoire_id", repertoireId).order("position", { ascending: true });
  if (basic.error) throw new Error(basic.error.message);
  return basic.data ?? [];
}

async function loadProgressRows(admin: any, repertoireId: string, userId: string) {
  const rich = await admin.from("ministry_repertoire_progress").select("repertoire_item_id,studied,studied_at,study_status,ready,ready_at").eq("repertoire_id", repertoireId).eq("user_id", userId);
  if (!rich.error) return rich.data ?? [];
  if (!isSchemaMissing(rich.error.message)) throw new Error(rich.error.message);
  const basic = await admin.from("ministry_repertoire_progress").select("repertoire_item_id,studied,studied_at,ready,ready_at").eq("repertoire_id", repertoireId).eq("user_id", userId);
  if (basic.error) throw new Error(basic.error.message);
  return basic.data ?? [];
}

async function loadAssignments(admin: any, repertoireId: string) {
  const rich = await admin.from("ministry_repertoire_assignments").select("id,member_id,repertoire_item_id,assigned_voice,notes,study_mode").eq("repertoire_id", repertoireId);
  if (!rich.error) return rich.data ?? [];
  if (!isSchemaMissing(rich.error.message)) throw new Error(rich.error.message);
  const basic = await admin.from("ministry_repertoire_assignments").select("id,member_id,repertoire_item_id,assigned_voice").eq("repertoire_id", repertoireId);
  if (basic.error) return [];
  return basic.data ?? [];
}

export default async function MeuRepertorioDetalhePage({ params }: { params: Promise<PageParams>; searchParams?: Promise<PageSearchParams> }) {
  const [context, resolvedParams] = await Promise.all([getCurrentUserAccessContext(), params]);
  if (context.isGuest) redirect("/login");
  if (!context.ministry?.ministryId || !context.profile?.id) redirect("/");
  const admin = createSupabaseAdminClient() as any;

  const [{ data: ministry }, { data: repertoire, error }] = await Promise.all([
    admin.from("ministries").select("id,name").eq("id", context.ministry.ministryId).maybeSingle(),
    admin.from("ministry_repertoires").select("id,name,description,event_date,created_at,archived,ministry_id,coordinator_member_id").eq("id", resolvedParams.id).eq("ministry_id", context.ministry.ministryId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (!repertoire?.id || repertoire.archived) notFound();

  const [rawItems, progressRows, membersResult, scaleAssignments] = await Promise.all([
    loadRepertoireItems(admin, repertoire.id),
    loadProgressRows(admin, repertoire.id, context.profile.id),
    admin.from("ministry_members").select("id,user_id,invited_name,invited_email,role,status,profiles(full_name,email)").eq("ministry_id", context.ministry.ministryId).neq("status", "removed").order("created_at", { ascending: true }),
    loadAssignments(admin, repertoire.id),
  ]);
  const members = membersResult.error ? [] : (membersResult.data ?? []);

  const currentMember = ((members ?? []) as MemberRow[]).find((member) => member.user_id === context.profile?.id) ?? null;
  const allMembers = ((members ?? []) as MemberRow[]).map((member) => ({ id: member.id, name: memberName(member), email: memberEmail(member), isCoordinator: member.id === repertoire.coordinator_member_id }));
  const assignments = (scaleAssignments ?? []) as AssignmentRow[];
  const defaultAssignment = currentMember ? assignments.find((assignment) => assignment.member_id === currentMember.id && !assignment.repertoire_item_id) : null;

  const kitIds = Array.from(new Set((rawItems ?? []).map((item: any) => item.kit_id).filter(Boolean)));
  const { data: kits, error: kitsError } = kitIds.length ? await admin.from("kits").select("id,slug,name,artist,cover_url").in("id", kitIds) : { data: [], error: null };
  if (kitsError) throw new Error(kitsError.message);

  const repertoireItems = mergeItemsWithKits(rawItems, kits as KitRow[]);
  const allProgressRows = (progressRows ?? []) as ProgressRow[];
  const progressMap = new Map(allProgressRows.filter((row) => row.repertoire_item_id).map((row) => [String(row.repertoire_item_id), row]));
  const readyRow = allProgressRows.find((row) => !row.repertoire_item_id && row.ready);
  const isReady = Boolean(readyRow?.ready);
  const studiedCount = repertoireItems.filter((item) => normalizeStudyStatus(progressMap.get(item.id)) === "studied").length;
  const reviewCount = repertoireItems.filter((item) => ["review", "doubt"].includes(normalizeStudyStatus(progressMap.get(item.id)))).length;
  const canConfirmReady = repertoireItems.length > 0 && studiedCount >= repertoireItems.length;
  const progressPercent = repertoireItems.length ? Math.round((studiedCount / repertoireItems.length) * 100) : 0;

  const tracks = repertoireItems.flatMap((item) => {
    const kit = item.kits;
    if (!kit) return [];
    const itemAssignment = currentMember ? assignments.find((assignment) => assignment.member_id === currentMember.id && assignment.repertoire_item_id === item.id) : null;
    const preferredVoice = itemAssignment?.assigned_voice || defaultAssignment?.assigned_voice || null;
    return [{ id: item.id, position: item.position, name: kit.name, artist: kit.artist, coverUrl: kit.cover_url, href: `/biblioteca/${kit.slug}`, kitId: item.kit_id ?? kit.id, studyStatus: normalizeStudyStatus(progressMap.get(item.id)), preferredVoice, preferredTone: item.key_override || null, scaleNotes: item.notes || null, individualNotes: itemAssignment?.notes || null, studyMode: itemAssignment?.study_mode || defaultAssignment?.study_mode || null }];
  });

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#050816] via-[#080b18] to-[#06070c] px-4 py-8 text-white md:px-8">
        <section className="mx-auto max-w-6xl">
          <Link href="/meus-repertorios" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"><ArrowLeft className="h-4 w-4" /> Voltar para Minha Escala</Link>
          <div className="mt-6 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-[#0b1120] via-[#120d24] to-[#06111f] p-6 shadow-[0_30px_100px_rgba(34,211,238,0.16)] md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100"><ListMusic className="h-4 w-4" /> Estudo da escala</div>
            <h1 className="mt-5 text-3xl font-black tracking-tight md:text-5xl">{repertoire.name}</h1>
            {repertoire.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">{repertoire.description}</p> : null}
            <p className="mt-3 text-sm text-cyan-100/80">Compartilhado por {ministry?.name ?? "seu ministério"}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-zinc-300">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2"><CalendarDays className="h-4 w-4 text-cyan-200" /> {repertoire.event_date ? formatDate(repertoire.event_date) : `Criado em ${formatDate(repertoire.created_at)}`}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2"><Music2 className="h-4 w-4 text-cyan-200" /> {repertoireItems.length} música{repertoireItems.length === 1 ? "" : "s"}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-cyan-100"><ShieldCheck className="h-4 w-4" /> {studiedCount} de {repertoireItems.length} concluídas</span>
              {reviewCount ? <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/25 bg-fuchsia-400/10 px-4 py-2 text-fuchsia-100">{reviewCount} pendência{reviewCount === 1 ? "" : "s"}</span> : null}
            </div>
          </div>

          {repertoireItems.length ? (
            <div className="mt-8 grid gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><div className="flex items-center justify-between gap-4 text-sm font-semibold text-zinc-200"><span>Progresso de estudo</span><span>{progressPercent}%</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${progressPercent}%` }} /></div><p className="mt-2 text-xs text-zinc-400">{studiedCount} concluída{studiedCount === 1 ? "" : "s"}; {reviewCount} para revisar/dúvida.</p></div>
              <MinistryPlaylistPlayer repertoireId={repertoire.id} updateStudyStatusAction={updateStudyStatus} tracks={tracks} teamMembers={allMembers} coordinatorName={allMembers.find((member) => member.isCoordinator)?.name ?? null} />
              <div className={`rounded-3xl border p-6 shadow-xl ${isReady ? "border-emerald-300/30 bg-emerald-400/[0.08]" : canConfirmReady ? "border-cyan-300/25 bg-cyan-400/[0.08]" : "border-white/10 bg-white/[0.04]"}`}><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-cyan-200">Confirmação final</p><h2 className="mt-2 text-2xl font-black text-white">{isReady ? "Você confirmou que está pronto" : "Estou pronto para tocar esta escala"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">{isReady ? "Sua liderança poderá acompanhar que você concluiu o estudo desta escala." : canConfirmReady ? "Todas as músicas foram marcadas como Estudei OK. Agora você pode confirmar que está pronto." : "Marque todas as músicas como Estudei OK para liberar esta confirmação."}</p></div><form action={toggleReady}><input type="hidden" name="repertoire_id" value={repertoire.id} /><input type="hidden" name="next_ready" value={isReady ? "false" : "true"} /><button disabled={!isReady && !canConfirmReady} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"><ShieldCheck className="h-4 w-4" /> {isReady ? "Desmarcar pronto" : "Confirmar pronto"}</button></form></div></div>
            </div>
          ) : <div className="mt-8 rounded-3xl border border-dashed border-white/10 bg-white/[0.04] p-10 text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"><Music2 className="h-7 w-7" /></div><h2 className="mt-5 text-2xl font-black text-white">Nenhuma música adicionada ainda</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-zinc-400">Quando a liderança adicionar músicas, elas aparecerão aqui para estudo.</p></div>}
        </section>
      </main>
    </PublicAppShell>
  );
}
