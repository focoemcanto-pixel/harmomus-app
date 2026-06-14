import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type StudyStatus = "not_studied" | "studied" | "doubt" | "review";
const STATUSES: StudyStatus[] = ["not_studied", "studied", "doubt", "review"];

function isSchemaMissing(message?: string | null) {
  const text = String(message ?? "").toLowerCase();
  return text.includes("does not exist") || text.includes("schema cache") || text.includes("could not find") || text.includes("column");
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
    const itemId = String(body?.itemId ?? "").trim();
    const kitId = String(body?.kitId ?? "").trim();
    const requested = String(body?.studyStatus ?? "not_studied") as StudyStatus;
    const studyStatus = STATUSES.includes(requested) ? requested : "not_studied";

    if (!repertoireId || !itemId || !kitId) return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });

    const admin = createSupabaseAdminClient() as any;
    const { data: repertoire, error: repertoireError } = await admin
      .from("ministry_repertoires")
      .select("id,archived")
      .eq("id", repertoireId)
      .eq("ministry_id", context.ministry.ministryId)
      .maybeSingle();

    if (repertoireError) throw new Error(repertoireError.message);
    if (!repertoire?.id || repertoire.archived) return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });

    const now = new Date().toISOString();
    const studied = studyStatus === "studied";
    const { data: existing, error: existingError } = await admin
      .from("ministry_repertoire_progress")
      .select("id")
      .eq("repertoire_id", repertoireId)
      .eq("repertoire_item_id", itemId)
      .eq("user_id", context.profile.id)
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const base = { studied, studied_at: studied ? now : null, updated_at: now };
    await saveProgress(
      admin,
      existing?.id ?? null,
      { repertoire_id: repertoireId, repertoire_item_id: itemId, kit_id: kitId, user_id: context.profile.id, ready: false, created_at: now, ...base, study_status: studyStatus },
      { repertoire_id: repertoireId, repertoire_item_id: itemId, kit_id: kitId, user_id: context.profile.id, ready: false, created_at: now, ...base },
    );

    return NextResponse.json({ ok: true, studyStatus, studied, studiedAt: studied ? now : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar status." }, { status: 500 });
  }
}
