import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type KitSearchRow = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  cover_url: string | null;
  created_at?: string | null;
};

function sanitizeSearchTerm(value: string) {
  return value
    .trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function normalizeSearchText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function scoreKit(kit: KitSearchRow, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 0;

  const name = normalizeSearchText(kit.name);
  const artist = normalizeSearchText(kit.artist);
  const text = `${name} ${artist}`.trim();

  if (name === query) return 100;
  if (name.startsWith(query)) return 90;
  if (artist.startsWith(query)) return 75;
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 65;
  if (text.includes(query)) return 45;

  const terms = query.split(/\s+/).filter(Boolean);
  const matchedTerms = terms.filter((term) => text.includes(term)).length;
  return matchedTerms ? 20 + matchedTerms : 0;
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
    .select("id,slug,name,artist,cover_url,created_at")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(query ? 60 : 24);

  if (query) {
    const escapedQuery = query.replace(/[%_]/g, "");
    const words = escapedQuery.split(/\s+/).filter(Boolean);
    const firstWord = words[0] ?? escapedQuery;

    kitsQuery = kitsQuery.or(
      [
        `name.ilike.${escapedQuery}%`,
        `artist.ilike.${escapedQuery}%`,
        `name.ilike.%${escapedQuery}%`,
        `artist.ilike.%${escapedQuery}%`,
        firstWord ? `name.ilike.%${firstWord}%` : null,
        firstWord ? `artist.ilike.%${firstWord}%` : null,
      ]
        .filter(Boolean)
        .join(","),
    );
  }

  const { data: kits, error: kitsError } = await kitsQuery;

  if (kitsError) {
    return NextResponse.json({ error: kitsError.message }, { status: 500 });
  }

  const rankedKits = query
    ? ((kits ?? []) as KitSearchRow[])
        .map((kit) => ({ kit, score: scoreKit(kit, query) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return normalizeSearchText(a.kit.name).localeCompare(normalizeSearchText(b.kit.name));
        })
        .slice(0, 12)
        .map(({ kit }) => kit)
    : (kits ?? []);

  return NextResponse.json({
    kits: rankedKits,
    existingKitIds: (existingItems ?? []).map((item: any) => String(item.kit_id)),
  });
}
