import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function isSchemaMissing(message?: string | null) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find") || text.includes("column");
}
function normalizeTone(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/♯/g, "#").replace(/＃/g, "#").replace(/\s+/g, "").toUpperCase();
  const flatMap: Record<string, string> = { DB: "C#", EB: "D#", GB: "F#", AB: "G#", BB: "A#" };
  return flatMap[normalized] ?? normalized;
}
async function getAvailableTones(admin: any, kitId: string): Promise<string[]> {
  const { data } = await admin.from("kit_audio_files").select("tone,source_type").eq("kit_id", kitId).in("source_type", ["original", "generated"]);
  return Array.from(new Set((data ?? []).map((file: any) => normalizeTone(file.tone)).filter(Boolean))) as string[];
}
async function saveItem(admin: any, repertoireId: string, itemId: string, tone: string, notes: string) {
  const payload = { key_override: tone || null, notes: notes || null };
  const rich = await admin.from("ministry_repertoire_items").update(payload).eq("id", itemId).eq("repertoire_id", repertoireId).select("id,key_override,notes").maybeSingle();
  if (!rich.error) return rich.data;
  if (!isSchemaMissing(rich.error.message)) throw new Error(rich.error.message);
  const fallback = await admin.from("ministry_repertoire_items").update({ key_override: tone || null }).eq("id", itemId).eq("repertoire_id", repertoireId).select("id,key_override").maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data;
}
async function upsertAssignment(admin: any, repertoireId: string, itemId: string, assignment: any) {
  const { data: existing } = await admin.from("ministry_repertoire_assignments").select("id").eq("repertoire_id", repertoireId).eq("repertoire_item_id", itemId).eq("member_id", assignment.memberId).maybeSingle();
  const payload = { repertoire_id: repertoireId, repertoire_item_id: itemId, member_id: assignment.memberId, assigned_voice: assignment.assignedVoice || null, notes: assignment.notes || null };
  const fallback = { repertoire_id: repertoireId, repertoire_item_id: itemId, member_id: assignment.memberId, assigned_voice: assignment.assignedVoice || null };
  const result = existing?.id ? await admin.from("ministry_repertoire_assignments").update(payload).eq("id", existing.id) : await admin.from("ministry_repertoire_assignments").insert(payload);
  if (result.error && isSchemaMissing(result.error.message)) {
    const basic = existing?.id ? await admin.from("ministry_repertoire_assignments").update(fallback).eq("id", existing.id) : await admin.from("ministry_repertoire_assignments").insert(fallback);
    if (basic.error) throw new Error(basic.error.message);
    return;
  }
  if (result.error) throw new Error(result.error.message);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    if (!context.ministry) return NextResponse.json({ error: "Ministério não encontrado." }, { status: 403 });
    if (!isMinistryManager(context)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const { id: repertoireId, itemId } = await params;
    const body = await request.json().catch(() => ({}));
    const keyOverride = normalizeTone(String(body.keyOverride ?? ""));
    const itemNotes = String(body.itemNotes ?? "").trim().slice(0, 600);
    const assignments = Array.isArray(body.assignments) ? body.assignments : [];

    const admin = createSupabaseAdminClient() as any;
    const { data: repertoire } = await admin.from("ministry_repertoires").select("id,archived").eq("id", repertoireId).eq("ministry_id", context.ministry.ministryId).maybeSingle();
    if (!repertoire?.id || repertoire.archived) return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });
    const { data: item } = await admin.from("ministry_repertoire_items").select("id,kit_id").eq("id", itemId).eq("repertoire_id", repertoireId).maybeSingle();
    if (!item?.id) return NextResponse.json({ error: "Música não encontrada." }, { status: 404 });

    if (keyOverride) {
      const tones = await getAvailableTones(admin, item.kit_id);
      if (!tones.includes(keyOverride)) return NextResponse.json({ error: "Esse tom não está disponível neste kit. Solicite o tom desejado." }, { status: 400 });
    }

    await saveItem(admin, repertoireId, itemId, keyOverride, itemNotes);
    for (const assignment of assignments) {
      const memberId = String(assignment.memberId ?? "").trim();
      if (!memberId) continue;
      await upsertAssignment(admin, repertoireId, itemId, {
        memberId,
        assignedVoice: String(assignment.assignedVoice ?? "").trim(),
        notes: String(assignment.notes ?? "").trim().slice(0, 300),
      });
    }

    return NextResponse.json({ ok: true, keyOverride, itemNotes, assignments }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar configuração." }, { status: 500 });
  }
}
