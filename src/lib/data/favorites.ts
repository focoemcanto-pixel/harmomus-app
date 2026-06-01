import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const FAVORITES_PLAYLIST_NAME = "Favoritos";

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

function favoritesSlugForUser(userId: string) {
  return `favoritos-${userId.replace(/-/g, "").slice(0, 12)}`;
}

async function getOrCreateFavoritesPlaylist(supabase: any, userId: string) {
  const { data: existing, error: existingError } = await supabase
    .from("playlists")
    .select("id, slug, name")
    .eq("user_id", userId)
    .eq("name", FAVORITES_PLAYLIST_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing;

  const baseSlug = favoritesSlugForUser(userId);
  let slug = baseSlug;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: slugTaken } = await supabase.from("playlists").select("id").eq("slug", slug).maybeSingle();
    if (!slugTaken?.id) break;
    slug = `${baseSlug}-${attempt + 1}`;
  }

  const { data: playlist, error } = await supabase
    .from("playlists")
    .insert({ user_id: userId, name: FAVORITES_PLAYLIST_NAME, slug, is_public: true })
    .select("id, slug, name")
    .single();

  if (error) throw new Error(error.message);
  return playlist;
}

async function addKitToFavoritesPlaylist(supabase: any, userId: string, kitId: string) {
  const playlist = await getOrCreateFavoritesPlaylist(supabase, userId);

  const { data: existing, error: existingError } = await supabase
    .from("playlist_items")
    .select("id")
    .eq("playlist_id", playlist.id)
    .eq("kit_id", kitId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return playlist;

  const { count, error: countError } = await supabase
    .from("playlist_items")
    .select("id", { count: "exact", head: true })
    .eq("playlist_id", playlist.id);

  if (countError) throw new Error(countError.message);

  const { error } = await supabase.from("playlist_items").insert({
    playlist_id: playlist.id,
    kit_id: kitId,
    position: (count ?? 0) + 1,
  });

  if (error) throw new Error(error.message);
  return playlist;
}

async function removeKitFromFavoritesPlaylist(supabase: any, userId: string, kitId: string) {
  const { data: playlist, error: playlistError } = await supabase
    .from("playlists")
    .select("id")
    .eq("user_id", userId)
    .eq("name", FAVORITES_PLAYLIST_NAME)
    .maybeSingle();

  if (playlistError) throw new Error(playlistError.message);
  if (!playlist?.id) return;

  const { error } = await supabase
    .from("playlist_items")
    .delete()
    .eq("playlist_id", playlist.id)
    .eq("kit_id", kitId);

  if (error) throw new Error(error.message);
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

  await addKitToFavoritesPlaylist(supabase, user.id, kit.id);
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

  await removeKitFromFavoritesPlaylist(supabase, user.id, kitId);
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
