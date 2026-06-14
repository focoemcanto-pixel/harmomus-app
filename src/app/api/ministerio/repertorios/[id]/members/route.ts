import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function requireManager() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) return { error: NextResponse.json({ error: "Faça login novamente." }, { status: 401 }) };
  if (!context.ministry) return { error: NextResponse.json({ error: "Ministério não encontrado." }, { status: 403 }) };
  if (!isMinistryManager(context)) return { error: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { context };
}

async function assertScale(admin: any, repertoireId: string, ministryId: string) {
  const { data, error } = await admin.from("ministry_repertoires").select("id,archived").eq("id", repertoireId).eq("ministry_id", ministryId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager();
    if (auth.error) return auth.error;
    const context = auth.context!;
    const { id: repertoireId } = await params;
    const body = await request.json().catch(() => ({}));
    const memberId = String(body.memberId ?? "").trim();
    const assignedVoice = String(body.assignedVoice ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim() || null;
    if (!memberId) return NextResponse.json({ error: "Selecione um integrante." }, { status: 400 });

    const admin = createSupabaseAdminClient() as any;
    const scale = await assertScale(admin, repertoireId, context.ministry!.ministryId);
    if (!scale?.id || scale.archived) return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });
    const { data: member } = await admin.from("ministry_members").select("id,invited_name,invited_email").eq("id", memberId).eq("ministry_id", context.ministry!.ministryId).maybeSingle();
    if (!member?.id) return NextResponse.json({ error: "Integrante inválido." }, { status: 404 });

    const payload = { repertoire_id: repertoireId, repertoire_item_id: null, member_id: memberId, assigned_voice: assignedVoice, notes };
    const { data: existing } = await admin.from("ministry_repertoire_assignments").select("id").eq("repertoire_id", repertoireId).eq("member_id", memberId).is("repertoire_item_id", null).maybeSingle();
    const result = existing?.id
      ? await admin.from("ministry_repertoire_assignments").update(payload).eq("id", existing.id).select("id,member_id,assigned_voice,notes").single()
      : await admin.from("ministry_repertoire_assignments").insert(payload).select("id,member_id,assigned_voice,notes").single();
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ row: result.data, member }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar vocal." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager();
    if (auth.error) return auth.error;
    const context = auth.context!;
    const { id: repertoireId } = await params;
    const body = await request.json().catch(() => ({}));
    const assignmentId = String(body.assignmentId ?? "").trim();
    const assignedVoice = String(body.assignedVoice ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim() || null;
    if (!assignmentId) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
    const admin = createSupabaseAdminClient() as any;
    const scale = await assertScale(admin, repertoireId, context.ministry!.ministryId);
    if (!scale?.id || scale.archived) return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });
    const result = await admin.from("ministry_repertoire_assignments").update({ assigned_voice: assignedVoice, notes }).eq("id", assignmentId).eq("repertoire_id", repertoireId).select("id,member_id,assigned_voice,notes").single();
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ row: result.data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar vocal." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager();
    if (auth.error) return auth.error;
    const context = auth.context!;
    const { id: repertoireId } = await params;
    const body = await request.json().catch(() => ({}));
    const assignmentId = String(body.assignmentId ?? "").trim();
    if (!assignmentId) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });
    const admin = createSupabaseAdminClient() as any;
    const scale = await assertScale(admin, repertoireId, context.ministry!.ministryId);
    if (!scale?.id || scale.archived) return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });
    const result = await admin.from("ministry_repertoire_assignments").delete().eq("id", assignmentId).eq("repertoire_id", repertoireId).is("repertoire_item_id", null);
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao remover vocal." }, { status: 500 });
  }
}
