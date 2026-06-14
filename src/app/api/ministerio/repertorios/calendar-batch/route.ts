import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function parseDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    if (!context.ministry) return NextResponse.json({ error: "Ministério não encontrado." }, { status: 403 });
    if (!isMinistryManager(context)) return NextResponse.json({ error: "Sem permissão para programar escalas." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const titlePrefix = String(body?.titlePrefix ?? "Culto").trim().slice(0, 80) || "Culto";
    const start = parseDate(String(body?.startDate ?? ""));
    const occurrences = Math.max(1, Math.min(Number(body?.occurrences ?? 1), 24));
    const frequency = String(body?.frequency ?? "weekly");
    const teamTemplateId = String(body?.teamTemplateId ?? "").trim();
    const description = String(body?.description ?? "").trim().slice(0, 500);

    if (!start) return NextResponse.json({ error: "Informe uma data inicial válida." }, { status: 400 });
    if (!teamTemplateId) return NextResponse.json({ error: "Selecione uma equipe/template." }, { status: 400 });

    const admin = createSupabaseAdminClient() as any;
    const { data: template, error: templateError } = await admin
      .from("ministry_team_templates")
      .select("id,name,coordinator_member_id")
      .eq("id", teamTemplateId)
      .eq("ministry_id", context.ministry.ministryId)
      .eq("archived", false)
      .maybeSingle();

    if (templateError) throw new Error(templateError.message);
    if (!template?.id) return NextResponse.json({ error: "Equipe/template não encontrado." }, { status: 404 });

    const { data: templateMembers } = await admin
      .from("ministry_team_template_members")
      .select("member_id,assigned_voice,notes")
      .eq("template_id", template.id);

    const stepDays = frequency === "biweekly" ? 14 : frequency === "monthly" ? 28 : 7;
    const now = new Date().toISOString();
    const scaleRows = Array.from({ length: occurrences }).map((_, index) => {
      const date = addDays(start, index * stepDays);
      const eventDate = toIsoDate(date);
      return {
        ministry_id: context.ministry!.ministryId,
        name: `${titlePrefix} • ${eventDate}`,
        description: description || null,
        event_date: eventDate,
        team_template_id: teamTemplateId,
        coordinator_member_id: template.coordinator_member_id || null,
        status: "scheduled",
        created_by: context.profile?.id ?? null,
        archived: false,
        created_at: now,
        updated_at: now,
      };
    });

    const { data: scales, error: insertError } = await admin
      .from("ministry_repertoires")
      .insert(scaleRows)
      .select("id,name,event_date");

    if (insertError) throw new Error(insertError.message);

    if ((templateMembers ?? []).length && (scales ?? []).length) {
      const assignmentRows = (scales ?? []).flatMap((scale: any) =>
        (templateMembers ?? []).map((member: any) => ({
          repertoire_id: scale.id,
          repertoire_item_id: null,
          member_id: member.member_id,
          assigned_voice: member.assigned_voice || null,
          notes: member.notes || null,
        })),
      );
      await admin.from("ministry_repertoire_assignments").insert(assignmentRows);
    }

    return NextResponse.json({ scales: scales ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao programar escalas." }, { status: 500 });
  }
}
