import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    if (!context.ministry) return NextResponse.json({ error: "Ministério não encontrado." }, { status: 403 });
    if (!isMinistryManager(context)) return NextResponse.json({ error: "Sem permissão para criar equipes." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim().slice(0, 100);
    const description = String(body?.description ?? "").trim().slice(0, 400);
    const coordinatorMemberId = String(body?.coordinator_member_id ?? "").trim();

    if (!name) return NextResponse.json({ error: "Informe o nome da equipe." }, { status: 400 });

    const admin = createSupabaseAdminClient() as any;
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("ministry_team_templates")
      .insert({
        ministry_id: context.ministry.ministryId,
        name,
        description: description || null,
        coordinator_member_id: coordinatorMemberId || null,
        created_by: context.profile?.id ?? null,
        archived: false,
        created_at: now,
        updated_at: now,
      })
      .select("id,name,description")
      .single();

    if (error || !data?.id) {
      return NextResponse.json({ error: error?.message || "Não foi possível criar a equipe." }, { status: 400 });
    }

    return NextResponse.json({ team: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro inesperado ao criar equipe." }, { status: 500 });
  }
}
