import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type StudyStatus = "not_studied" | "studied" | "doubt" | "review";
const STATUSES: StudyStatus[] = ["not_studied", "studied", "doubt", "review"];

function isSchemaMissing(message?: string | null) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find") || text.includes("column");
}
function status(row?: any): StudyStatus {
  return row?.study_status && STATUSES.includes(row.study_status) ? row.study_status : row?.studied ? "studied" : "not_studied";
}
async function saveProgress(admin: any, id: string | null, payload: Record<string, unknown>, fallback: Record<string, unknown>) {
  if (id) {
    const rich = await admin.from("ministry_repertoire_progress").update(payload).eq("id", id);
    if (!rich.error) return;
    if (!isSchemaMissing(rich.error.message)) throw new Error(rich.error.message);
    const basic = await admin.from("ministry_repertoire_progress").update(fallback).eq("id", id);
    if (basic.error) throw new Error(basic.error.message);
    return;
  }
  const rich = await admin.from("ministry_repertoire_progress").insert(payload);
  if (!rich.error) return;
  if (!isSchemaMissing(rich.error.message)) throw new Error(rich.error.message);
  const basic = await admin.from("ministry_repertoire_progress").insert(fallback);
  if (basic.error) throw new Error(basic.error.message);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.profile?.id) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    if (!context.ministry?.ministryId) return NextResponse.json({ error: "Ministério não encontrado." }, { status: 403 });
    const { id: repertoireId } = await params;
    const body = await request.json().catch(() => ({}));
    const ready = Boolean(body?.ready);
    const admin = createSupabaseAdminClient() as any;

    const { data: repertoire, error: repertoireError } = await admin.from("ministry_repertoires").select("id,archived").eq("id", repertoireId).eq("ministry_id", context.ministry.ministryId).maybeSingle();
    if (repertoireError) throw new Error(repertoireError.message);
    if (!repertoire?.id || repertoire.archived) return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });

    if (ready) {
      const [{ data: items, error: itemsError }, { data: progress, error: progressError }] = await Promise.all([
        admin.from("ministry_repertoire_items").select("id").eq("repertoire_id", repertoireId),
        admin.from("ministry_repertoire_progress").select("repertoire_item_id,studied,study_status").eq("repertoire_id", repertoireId).eq("user_id", context.profile.id),
      ]);
      if (itemsError) throw new Error(itemsError.message);
      if (progressError) throw new Error(progressError.message);
      const itemIds = new Set((items ?? []).map((item: any) => String(item.id)));
      const studiedIds = new Set((progress ?? []).filter((row: any) => row.repertoire_item_id && status(row) === "studied").map((row: any) => String(row.repertoire_item_id)));
      if (!itemIds.size || studiedIds.size < itemIds.size) return NextResponse.json({ error: "Marque todas as músicas como Estudei OK antes de confirmar." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: existing, error: existingError } = await admin.from("ministry_repertoire_progress").select("id").eq("repertoire_id", repertoireId).eq("user_id", context.profile.id).is("repertoire_item_id", null).maybeSingle();
    if (existingError) throw new Error(existingError.message);

    await saveProgress(admin, existing?.id ?? null, { repertoire_id: repertoireId, repertoire_item_id: null, kit_id: null, user_id: context.profile.id, studied: false, studied_at: null, ready, ready_at: ready ? now : null, created_at: now, updated_at: now }, { repertoire_id: repertoireId, repertoire_item_id: null, kit_id: null, user_id: context.profile.id, studied: false, studied_at: null, ready, ready_at: ready ? now : null, created_at: now, updated_at: now });
    return NextResponse.json({ ok: true, ready, readyAt: ready ? now : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao confirmar prontidão." }, { status: 500 });
  }
}
