import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function sanitizeSearchTerm(value: string) {
  return value
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!context.ministry || !isMinistryManager(context)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient() as any;
  const query = sanitizeSearchTerm(request.nextUrl.searchParams.get("q") ?? "");

  const { data: repertoire, error: repertoireError } = await admin
    .from("ministry_repertoires")
    .select("id,ministry_id,archived")
    .eq("id", id)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (repertoireError) {
    return NextResponse.json({ error: repertoireError.message }, { status: 500 });
  }

  if (!repertoire?.id || repertoire.archived) {
    return NextResponse.json({ error: "Escala não encontrada." }, { status: 404 });
  }

  const { data: existingItems, error: existingError } = await admin
    .from("ministry_repertoire_items")
    .select("kit_id")
    .eq("repertoire_id", repertoire.id);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  let kitsQuery = admin
    .from("kits")
    .select("id,slug,name,artist,cover_url")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(24);

  if (query) {
    const escapedQuery = query.replace(/[%_]/g, "");
    kitsQuery = kitsQuery.or(`name.ilike.%${escapedQuery}%,artist.ilike.%${escapedQuery}%`);
  }

  const { data: kits, error: kitsError } = await kitsQuery;

  if (kitsError) {
    return NextResponse.json({ error: kitsError.message }, { status: 500 });
  }

  return NextResponse.json({
    kits: kits ?? [],
    existingKitIds: (existingItems ?? []).map((item: any) => String(item.kit_id)),
  });
}
