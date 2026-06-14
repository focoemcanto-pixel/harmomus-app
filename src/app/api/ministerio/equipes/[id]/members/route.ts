import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function assertTeam(admin: any, templateId: string, ministryId: string) {
  const { data, error } = await admin
    .from("ministry_team_templates")
    .select("id,coordinator_member_id")
    .eq("id", templateId)
    .eq("ministry_id", ministryId)
    .eq("archived", false)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function requireManager() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) return { error: NextResponse.json({ error: "Faça login novamente." }, { status: 401 }) };
  if (!context.ministry) return { error: NextResponse.json({ error: "Ministério não encontrado." }, { status: 403 }) };
  if (!isMinistryManager(context)) return { error: NextResponse.json({ error: "Sem permissão." }, { status: 403 }) };
  return { context };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager();
    if (auth.error) return auth.error;
    const context = auth.context!;
    const { id: templateId } = await params;
    const body = await request.json().catch(() => ({}));
    const memberId = String(body.memberId ?? "").trim();
    const assignedVoice = String(body.assignedVoice ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim() || null;
    const makeCoordinator = Boolean(body.makeCoordinator);
    if (!memberId) return NextResponse.json({ error: "Selecione um integrante." }, { status: 400 });

    const admin = createSupabaseAdminClient() as any;
    const team = await assertTeam(admin, templateId, context.ministry!.ministryId);
    if (!team?.id) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

    const { data: member } = await admin.from("ministry_members").select("id,invited_name,invited_email").eq("id", memberId).eq("ministry_id", context.ministry!.ministryId).maybeSingle();
    if (!member?.id) return NextResponse.json({ error: "Integrante não encontrado." }, { status: 404 });

    const payload = { template_id: templateId, member_id: memberId, assigned_voice: assignedVoice, notes };
    const { data: existing } = await admin.from("ministry_team_template_members").select("id").eq("template_id", templateId).eq("member_id", memberId).maybeSingle();
    const result = existing?.id
      ? await admin.from("ministry_team_template_members").update(payload).eq("id", existing.id).select("id,member_id,assigned_voice,notes").single()
      : await admin.from("ministry_team_template_members").insert(payload).select("id,member_id,assigned_voice,notes").single();
    if (result.error) throw new Error(result.error.message);

    if (makeCoordinator) {
      const coordinator = await admin.from("ministry_team_templates").update({ coordinator_member_id: memberId }).eq("id", templateId).eq("ministry_id", context.ministry!.ministryId);
      if (coordinator.error) throw new Error(coordinator.error.message);
    }

    return NextResponse.json({ row: result.data, member, coordinatorMemberId: makeCoordinator ? memberId : team.coordinator_member_id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao adicionar integrante." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager();
    if (auth.error) return auth.error;
    const context = auth.context!;
    const { id: templateId } = await params;
    const body = await request.json().catch(() => ({}));
    const rowId = String(body.rowId ?? "").trim();
    const memberId = String(body.memberId ?? "").trim();
    const assignedVoice = String(body.assignedVoice ?? "").trim() || null;
    const notes = String(body.notes ?? "").trim() || null;
    const makeCoordinator = Boolean(body.makeCoordinator);
    const clearCoordinator = Boolean(body.clearCoordinator);
    if (!rowId && !clearCoordinator) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });

    const admin = createSupabaseAdminClient() as any;
    const team = await assertTeam(admin, templateId, context.ministry!.ministryId);
    if (!team?.id) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

    let row = null;
    if (rowId) {
      const result = await admin.from("ministry_team_template_members").update({ assigned_voice: assignedVoice, notes }).eq("id", rowId).eq("template_id", templateId).select("id,member_id,assigned_voice,notes").single();
      if (result.error) throw new Error(result.error.message);
      row = result.data;
    }

    let coordinatorMemberId = team.coordinator_member_id ?? null;
    if (makeCoordinator && memberId) {
      const coordinator = await admin.from("ministry_team_templates").update({ coordinator_member_id: memberId }).eq("id", templateId).eq("ministry_id", context.ministry!.ministryId);
      if (coordinator.error) throw new Error(coordinator.error.message);
      coordinatorMemberId = memberId;
    }
    if (clearCoordinator) {
      const coordinator = await admin.from("ministry_team_templates").update({ coordinator_member_id: null }).eq("id", templateId).eq("ministry_id", context.ministry!.ministryId);
      if (coordinator.error) throw new Error(coordinator.error.message);
      coordinatorMemberId = null;
    }

    return NextResponse.json({ row, coordinatorMemberId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar integrante." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireManager();
    if (auth.error) return auth.error;
    const context = auth.context!;
    const { id: templateId } = await params;
    const body = await request.json().catch(() => ({}));
    const rowId = String(body.rowId ?? "").trim();
    const memberId = String(body.memberId ?? "").trim();
    if (!rowId) return NextResponse.json({ error: "Registro inválido." }, { status: 400 });

    const admin = createSupabaseAdminClient() as any;
    const team = await assertTeam(admin, templateId, context.ministry!.ministryId);
    if (!team?.id) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

    const result = await admin.from("ministry_team_template_members").delete().eq("id", rowId).eq("template_id", templateId);
    if (result.error) throw new Error(result.error.message);
    let coordinatorMemberId = team.coordinator_member_id ?? null;
    if (memberId && team.coordinator_member_id === memberId) {
      await admin.from("ministry_team_templates").update({ coordinator_member_id: null }).eq("id", templateId).eq("ministry_id", context.ministry!.ministryId);
      coordinatorMemberId = null;
    }
    return NextResponse.json({ ok: true, coordinatorMemberId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao remover integrante." }, { status: 500 });
  }
}
