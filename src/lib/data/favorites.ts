import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FavoriteKit = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  cover_url: string | null;
  favorited_at: string;
};

async function getAuthenticatedFavoriteUser() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) throw new Error("Faça login para favoritar kits.");

  const authClient = await createClient();
  const { data } = await authClient.auth.getUser();
  const user = data.user;

  if (!user) throw new Error("Faça login para favoritar kits.");
  return { context, user };
}

export async function addFavoriteKit(kitId: string) {
  if (!kitId) throw new Error("Kit obrigatório.");
  const { user } = await getAuthenticatedFavoriteUser();
  const supabase = createSupabaseAdminClient() as any;

  const { data: kit, error: kitError } = await supabase
    .from("kits")
    .select("id,published")
    .eq("id", kitId)
    .eq("published", true)
    .maybeSingle();

  if (kitError) throw new Error(kitError.message);
  if (!kit?.id) throw new Error("Kit não encontrado ou indisponível.");

  const { error } = await supabase
    .from("kit_favorites")
    .upsert({ user_id: user.id, kit_id: kit.id }, { onConflict: "user_id,kit_id", ignoreDuplicates: true });

  if (error) throw new Error(error.message);
}

export async function removeFavoriteKit(kitId: string) {
  if (!kitId) throw new Error("Kit obrigatório.");
  const { user } = await getAuthenticatedFavoriteUser();
  const supabase = createSupabaseAdminClient() as any;

  const { error } = await supabase
    .from("kit_favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("kit_id", kitId);

  if (error) throw new Error(error.message);
}

export async function toggleFavoriteKit(kitId: string) {
  if (!kitId) throw new Error("Kit obrigatório.");
  const { user } = await getAuthenticatedFavoriteUser();
  const supabase = createSupabaseAdminClient() as any;

  const { data: existing, error: existingError } = await supabase
    .from("kit_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("kit_id", kitId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);

  if (existing?.id) {
    await removeFavoriteKit(kitId);
    return { favorited: false };
  }

  await addFavoriteKit(kitId);
  return { favorited: true };
}

export async function isFavoriteKit(kitId: string) {
  if (!kitId) return false;
  const authClient = await createClient();
  const { data } = await authClient.auth.getUser();
  const user = data.user;
  if (!user) return false;

  const supabase = createSupabaseAdminClient() as any;
  const { data: existing } = await supabase
    .from("kit_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("kit_id", kitId)
    .maybeSingle();

  return Boolean(existing?.id);
}

export async function getUserFavoriteKits(limit = 100): Promise<FavoriteKit[]> {
  const authClient = await createClient();
  const { data } = await authClient.auth.getUser();
  const user = data.user;
  if (!user) return [];

  const supabase = createSupabaseAdminClient() as any;
  const { data: rows, error } = await supabase
    .from("kit_favorites")
    .select("created_at,kits!inner(id,slug,name,artist,cover_url,published)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return (rows ?? [])
    .filter((row: any) => row.kits?.published)
    .map((row: any) => ({
      id: row.kits.id,
      slug: row.kits.slug,
      name: row.kits.name,
      artist: row.kits.artist,
      cover_url: row.kits.cover_url,
      favorited_at: row.created_at,
    }));
}

export async function getMostFavoritedKits(limit = 10): Promise<Array<FavoriteKit & { favorites: number }>> {
  const supabase = createSupabaseAdminClient() as any;
  const { data: favorites, error } = await supabase.from("kit_favorites").select("kit_id").limit(5000);
  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const favorite of favorites ?? []) {
    if (!favorite.kit_id) continue;
    counts.set(favorite.kit_id, (counts.get(favorite.kit_id) ?? 0) + 1);
  }

  const ids = Array.from(counts.keys());
  if (!ids.length) return [];

  const { data: kits, error: kitsError } = await supabase
    .from("kits")
    .select("id,slug,name,artist,cover_url")
    .in("id", ids)
    .eq("published", true);

  if (kitsError) throw new Error(kitsError.message);

  return (kits ?? [])
    .map((kit: any) => ({ ...kit, favorited_at: "", favorites: counts.get(kit.id) ?? 0 }))
    .sort((a: any, b: any) => b.favorites - a.favorites)
    .slice(0, limit);
}
