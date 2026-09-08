"use client";

import { createClient } from "@/lib/supabase/client";

export type CatalogSearchTrackingInput = {
  query: string;
  resultCount: number;
  source?: string;
  viewerPlan?: string;
  category?: string;
  artist?: string;
  planFilter?: string;
};

export function normalizeCatalogSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function trackCatalogSearch(input: CatalogSearchTrackingInput) {
  const query = input.query.trim().replace(/\s+/g, " ");
  const normalizedQuery = normalizeCatalogSearch(query);

  if (normalizedQuery.length < 2) return;

  try {
    const supabase = createClient() as any;
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id;

    // A tabela já possui RLS para inserts do próprio usuário. Buscas de visitantes
    // sem sessão não são persistidas, evitando abrir um endpoint público de escrita.
    if (!userId) return;

    await supabase.from("usage_tracking").insert({
      user_id: userId,
      action: "catalog_search",
      metadata: {
        query,
        normalizedQuery,
        resultCount: Math.max(0, Number(input.resultCount) || 0),
        found: input.resultCount > 0,
        source: input.source ?? "biblioteca",
        viewerPlan: input.viewerPlan ?? null,
        category: input.category || null,
        artist: input.artist || null,
        planFilter: input.planFilter || null,
      },
    });
  } catch {
    // Analytics nunca deve bloquear a experiência principal do usuário.
  }
}
