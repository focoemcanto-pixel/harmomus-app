import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!context.ministry || !isMinistryManager(context)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient() as any;

  const { data: repertoire, error: findError } = await admin
    .from("ministry_repertoires")
    .select("id,ministry_id,archived")
    .eq("id", id)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!repertoire?.id || repertoire.archived) {
    return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });
  }

  const { error } = await admin
    .from("ministry_repertoires")
    .update({ archived: true })
    .eq("id", repertoire.id)
    .eq("ministry_id", context.ministry.ministryId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
