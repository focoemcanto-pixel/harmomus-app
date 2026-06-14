import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest) return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
    if (!context.ministry) return NextResponse.json({ error: "Ministério não encontrado." }, { status: 403 });
    if (!isMinistryManager(context)) return NextResponse.json({ error: "Sem permissão para excluir equipes." }, { status: 403 });

    const { id } = await params;
    const admin = createSupabaseAdminClient() as any;
    const { data: team, error: readError } = await admin
      .from("ministry_team_templates")
      .select("id")
      .eq("id", id)
      .eq("ministry_id", context.ministry.ministryId)
      .eq("archived", false)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!team?.id) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

    const { error } = await admin
      .from("ministry_team_templates")
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("ministry_id", context.ministry.ministryId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir equipe." }, { status: 500 });
  }
}
