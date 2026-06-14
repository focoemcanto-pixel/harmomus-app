import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!context.ministry || !isMinistryManager(context)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const kitId = String(body?.kitId ?? "").trim();

  if (!kitId) {
    return NextResponse.json({ error: "Kit inválido." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient() as any;

  const { data: repertoire, error: repertoireError } = await admin
    .from("ministry_repertoires")
    .select("id,ministry_id,name,archived")
    .eq("id", id)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (repertoireError) {
    return NextResponse.json({ error: repertoireError.message }, { status: 500 });
  }

  if (!repertoire?.id || repertoire.archived) {
    return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });
  }

  const { data: kit, error: kitError } = await admin
    .from("kits")
    .select("id,name,artist,published")
    .eq("id", kitId)
    .eq("published", true)
    .maybeSingle();

  if (kitError) {
    return NextResponse.json({ error: kitError.message }, { status: 500 });
  }

  if (!kit?.id) {
    return NextResponse.json({ error: "Kit indisponível." }, { status: 404 });
  }

  const { data: existing } = await admin
    .from("ministry_repertoire_items")
    .select("id")
    .eq("repertoire_id", repertoire.id)
    .eq("kit_id", kitId)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ ok: true, alreadyAdded: true });
  }

  const { count } = await admin
    .from("ministry_repertoire_items")
    .select("id", { count: "exact", head: true })
    .eq("repertoire_id", repertoire.id);

  const position = (count ?? 0) + 1;

  const { data: inserted, error } = await admin
    .from("ministry_repertoire_items")
    .insert({
      repertoire_id: repertoire.id,
      kit_id: kitId,
      position,
    })
    .select("id,position")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    item: inserted,
    kit: {
      id: kit.id,
      name: kit.name,
      artist: kit.artist,
    },
  });
}
