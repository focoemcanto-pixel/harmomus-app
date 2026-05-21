import { createClient } from "@/lib/supabase/server";

const MAX_KITS = 20;

export interface PlaylistKitSummary {
  id: string;
  slug: string;
  name: string;
  artist: string;
  cover_url: string | null;
  category: { name: string; slug: string } | null;
}

export interface PublicPlaylist {
  id: string;
  name: string;
  slug: string;
  kits: PlaylistKitSummary[];
}

function toSlug(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60) || "playlist";
}

async function generateUniqueSlug(baseName: string): Promise<string> {
  const supabase = (await createClient()) as any;
  const base = toSlug(baseName);
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from("playlists").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

export async function searchPublishedKits(query: string) {
  const supabase = (await createClient()) as any;
  let q = supabase.from("kits").select("id, slug, name, artist, cover_url, category_id").eq("published", true).limit(20);
  if (query.trim()) q = q.or(`name.ilike.%${query}%,artist.ilike.%${query}%`);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPublishedKitsForPlaylist() {
  return searchPublishedKits("");
}

export async function getPlaylistBySlug(slug: string): Promise<PublicPlaylist | null> {
  const supabase = (await createClient()) as any;
  const { data: playlist } = await supabase.from("playlists").select("id, name, slug, is_public").eq("slug", slug).maybeSingle();
  if (!playlist || !playlist.is_public) return null;

  const { data: items, error } = await supabase
    .from("playlist_items")
    .select("position, kits!inner(id, slug, name, artist, cover_url, category_id, published)")
    .eq("playlist_id", playlist.id)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  const catIds = Array.from(new Set((items ?? []).map((i: any) => i.kits.category_id).filter(Boolean)));
  const { data: categories } = await supabase.from("categories").select("id, name, slug").in("id", catIds.length ? catIds : ["00000000-0000-0000-0000-000000000000"]);
  const cmap = new Map((categories ?? []).map((c: any) => [c.id, c]));

  return {
    id: playlist.id,
    name: playlist.name,
    slug: playlist.slug,
    kits: (items ?? []).filter((i: any) => i.kits.published).map((i: any) => ({ ...i.kits, category: i.kits.category_id ? cmap.get(i.kits.category_id) ?? null : null })),
  };
}

export async function createPlaylist({ name, kitIds }: { name: string; kitIds: string[] }) {
  if (!name.trim()) throw new Error("Nome obrigatório.");
  const uniqueKitIds = Array.from(new Set(kitIds));
  if (uniqueKitIds.length === 0) throw new Error("Selecione ao menos 1 kit.");
  if (uniqueKitIds.length > MAX_KITS) throw new Error("Máximo de 20 kits por playlist.");

  const supabase = (await createClient()) as any;
  const { data: publishedKits } = await supabase.from("kits").select("id").in("id", uniqueKitIds).eq("published", true);
  const allowedIds = new Set((publishedKits ?? []).map((k: any) => k.id));
  const filtered = uniqueKitIds.filter((id) => allowedIds.has(id));
  if (!filtered.length) throw new Error("Nenhum kit publicado válido.");

  const slug = await generateUniqueSlug(name);
  // TODO: associar user_id quando autenticação estiver pronta.
  const { data: playlist, error } = await supabase.from("playlists").insert({ name: name.trim(), slug, user_id: null, is_public: true }).select("id, slug").single();
  if (error) throw new Error(error.message);

  const items = filtered.map((kit_id, idx) => ({ playlist_id: playlist.id, kit_id, position: idx + 1 }));
  const { error: itemErr } = await supabase.from("playlist_items").insert(items);
  if (itemErr) throw new Error(itemErr.message);
  return playlist;
}

export async function addKitToPlaylist(playlistId: string, kitId: string) {
  const supabase = (await createClient()) as any;
  const { data: kit } = await supabase.from("kits").select("id").eq("id", kitId).eq("published", true).maybeSingle();
  if (!kit) throw new Error("Kit inválido.");
  const { data: existing } = await supabase.from("playlist_items").select("id").eq("playlist_id", playlistId).eq("kit_id", kitId).maybeSingle();
  if (existing) return;
  const { count } = await supabase.from("playlist_items").select("id", { count: "exact", head: true }).eq("playlist_id", playlistId);
  if ((count ?? 0) >= MAX_KITS) throw new Error("Limite de 20 kits atingido.");
  await supabase.from("playlist_items").insert({ playlist_id: playlistId, kit_id: kitId, position: (count ?? 0) + 1 });
}

export async function removeKitFromPlaylist(playlistId: string, kitId: string) {
  const supabase = (await createClient()) as any;
  await supabase.from("playlist_items").delete().eq("playlist_id", playlistId).eq("kit_id", kitId);
}
