import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    if (!context.ministry) return NextResponse.json({ error: "Ministério não encontrado." }, { status: 403 });
    if (!isMinistryManager(context)) return NextResponse.json({ error: "Sem permissão para criar escalas." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim().slice(0, 120);
    const description = String(body.description ?? "").trim().slice(0, 500);
    const generalNotes = String(body.generalNotes ?? "").trim().slice(0, 700);
    const eventDate = String(body.eventDate ?? "").trim() || null;
    const teamTemplateId = String(body.teamTemplateId ?? "").trim() || null;
    const coordinatorMemberId = String(body.coordinatorMemberId ?? "").trim() || null;
    if (!name) return NextResponse.json({ error: "Informe o nome da escala." }, { status: 400 });

    const admin = createSupabaseAdminClient() as any;
    const now = new Date().toISOString();
    let templateMembers: any[] = [];
    let resolvedCoordinatorId = coordinatorMemberId;

    if (teamTemplateId) {
      const { data: template, error: templateError } = await admin
        .from("ministry_team_templates")
        .select("id,coordinator_member_id")
        .eq("id", teamTemplateId)
        .eq("ministry_id", context.ministry.ministryId)
        .eq("archived", false)
        .maybeSingle();
      if (templateError) throw new Error(templateError.message);
      if (template?.id) {
        resolvedCoordinatorId = resolvedCoordinatorId || template.coordinator_member_id || null;
        const { data: members, error: membersError } = await admin
          .from("ministry_team_template_members")
          .select("member_id,assigned_voice,notes")
          .eq("template_id", template.id);
        if (membersError) throw new Error(membersError.message);
        templateMembers = members ?? [];
      }
    }

    const finalDescription = [description, generalNotes ? `Observação geral: ${generalNotes}` : ""].filter(Boolean).join("\n\n") || null;
    const { data, error } = await admin
      .from("ministry_repertoires")
      .insert({ ministry_id: context.ministry.ministryId, name, description: finalDescription, event_date: eventDate, team_template_id: teamTemplateId, coordinator_member_id: resolvedCoordinatorId, status: "scheduled", created_by: context.profile?.id ?? null, archived: false, created_at: now, updated_at: now })
      .select("id")
      .single();

    if (error || !data?.id) return NextResponse.json({ error: error?.message || "Não foi possível criar a escala." }, { status: 400 });

    if (templateMembers.length) {
      const assignment = await admin.from("ministry_repertoire_assignments").insert(templateMembers.map((member) => ({ repertoire_id: data.id, repertoire_item_id: null, member_id: member.member_id, assigned_voice: member.assigned_voice || null, notes: member.notes || null })));
      if (assignment.error) throw new Error(assignment.error.message);
    }

    return NextResponse.json({ scale: { id: data.id } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao criar escala." }, { status: 500 });
  }
}
