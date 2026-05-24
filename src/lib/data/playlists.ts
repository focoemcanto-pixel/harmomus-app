import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_KITS = 20;

export type PlaylistTrackVoice = "todos" | "tenor" | "contralto" | "soprano" | "baritono";

export interface PlaylistKitSummary {
  id: string;
  slug: string;
  name: string;
  artist: string;
  cover_url: string | null;
  original_tone: string | null;
  default_tone: string | null;
  allow_pitch_shift: boolean;
  max_pitch_shift_semitones: number;
  category: { name: string; slug: string } | null;
  tracks: {
    id: string;
    tone: string;
    voice: PlaylistTrackVoice;
    name: string;
    streamUrl: string;
    fileType: string;
  }[];
}

export interface PublicPlaylist {
  id: string;
  name: string;
  slug: string;
  kits: PlaylistKitSummary[];
}

export interface UserPlaylistSummary {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  createdAt: string;
  kitCount: number;
  covers: { id: string; name: string; artist: string; cover_url: string | null }[];
}

function toSlug(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60) || "playlist";
}

async function generateUniqueSlug(baseName: string): Promise<string> {
  const supabase = createSupabaseAdminClient() as any;
  const base = toSlug(baseName);
  let slug = base;
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from("playlists").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

export async function getCurrentUserPlaylists(): Promise<UserPlaylistSummary[]> {
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;
  if (!user) return [];

  const supabase = createSupabaseAdminClient() as any;
  const { data: playlists, error } = await supabase
    .from("playlists")
    .select("id, name, slug, is_public, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!playlists?.length) return [];

  const playlistIds = playlists.map((playlist: any) => playlist.id);
  const { data: items, error: itemsError } = await supabase
    .from("playlist_items")
    .select("playlist_id, position, kits!inner(id, name, artist, cover_url, published)")
    .in("playlist_id", playlistIds)
    .order("position", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);

  const itemsByPlaylist = new Map<string, any[]>();
  for (const item of items ?? []) {
    if (!item.kits?.published) continue;
    const current = itemsByPlaylist.get(item.playlist_id) ?? [];
    current.push(item);
    itemsByPlaylist.set(item.playlist_id, current);
  }

  return playlists.map((playlist: any) => {
    const playlistItems = itemsByPlaylist.get(playlist.id) ?? [];
    return {
      id: playlist.id,
      name: playlist.name,
      slug: playlist.slug,
      isPublic: Boolean(playlist.is_public),
      createdAt: playlist.created_at,
      kitCount: playlistItems.length,
      covers: playlistItems.slice(0, 4).map((item: any) => ({
        id: item.kits.id,
        name: item.kits.name,
        artist: item.kits.artist,
        cover_url: item.kits.cover_url,
      })),
    };
  });
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
  const supabase = createSupabaseAdminClient() as any;
  const { data: playlist } = await supabase.from("playlists").select("id, name, slug, is_public").eq("slug", slug).maybeSingle();
  if (!playlist || !playlist.is_public) return null;

  const { data: items, error } = await supabase
    .from("playlist_items")
    .select("position, kits!inner(id, slug, name, artist, cover_url, category_id, original_tone, default_tone, allow_pitch_shift, max_pitch_shift_semitones, published)")
    .eq("playlist_id", playlist.id)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  const catIds = Array.from(new Set((items ?? []).map((i: any) => i.kits.category_id).filter(Boolean)));
  const { data: categories } = catIds.length
    ? await supabase.from("categories").select("id, name, slug").in("id", catIds)
    : { data: [] };
  const cmap = new Map((categories ?? []).map((c: any) => [c.id, c]));

  const kitIds = (items ?? []).map((i: any) => i.kits.id);
  const { data: audioFiles, error: audioFilesError } = kitIds.length
    ? await supabase.from("kit_audio_files").select("id, kit_id, tone, name, file_type").in("kit_id", kitIds)
    : { data: [], error: null };
  if (audioFilesError) throw new Error(audioFilesError.message);

  const normalizeVoice = (value: string): PlaylistTrackVoice => {
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (normalized.includes("soprano")) return "soprano";
    if (normalized.includes("contralto")) return "contralto";
    if (normalized.includes("tenor")) return "tenor";
    if (normalized.includes("baritono")) return "baritono";
    return "todos";
  };

  const filesByKitId = new Map<string, any[]>();
  for (const file of audioFiles ?? []) {
    const list = filesByKitId.get(file.kit_id) ?? [];
    list.push(file);
    filesByKitId.set(file.kit_id, list);
  }

  return {
    id: playlist.id,
    name: playlist.name,
    slug: playlist.slug,
    kits: (items ?? [])
      .filter((i: any) => i.kits.published)
      .map((i: any) => ({
        ...i.kits,
        original_tone: i.kits.original_tone ?? null,
        default_tone: i.kits.default_tone ?? null,
        allow_pitch_shift: i.kits.allow_pitch_shift ?? true,
        max_pitch_shift_semitones: i.kits.max_pitch_shift_semitones ?? 2,
        category: i.kits.category_id ? cmap.get(i.kits.category_id) ?? null : null,
        tracks: (filesByKitId.get(i.kits.id) ?? [])
          .sort((a, b) => `${a.tone}-${a.name}`.localeCompare(`${b.tone}-${b.name}`, "pt-BR"))
          .map((file) => ({
            id: file.id,
            tone: file.tone,
            voice: normalizeVoice(file.name),
            name: file.name,
            streamUrl: `/api/audio/${file.id}`,
            fileType: file.file_type,
          })),
      })),
  };
}

export async function createPlaylist({ name, kitIds }: { name: string; kitIds: string[] }) {
  if (!name.trim()) throw new Error("Nome obrigatório.");
  const uniqueKitIds = Array.from(new Set(kitIds));
  if (uniqueKitIds.length === 0) throw new Error("Selecione ao menos 1 kit.");
  if (uniqueKitIds.length > MAX_KITS) throw new Error("Máximo de 20 kits por playlist.");

  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("Faça login para criar sua playlist.");

  const supabase = createSupabaseAdminClient() as any;
  const { data: publishedKits, error: kitsError } = await supabase.from("kits").select("id").in("id", uniqueKitIds).eq("published", true);
  if (kitsError) throw new Error(kitsError.message);
  const allowedIds = new Set((publishedKits ?? []).map((k: any) => k.id));
  const filtered = uniqueKitIds.filter((id) => allowedIds.has(id));
  if (!filtered.length) throw new Error("Nenhum kit publicado válido.");

  const slug = await generateUniqueSlug(name);
  const { data: playlist, error } = await supabase.from("playlists").insert({ name: name.trim(), slug, user_id: user.id, is_public: true }).select("id, slug").single();
  if (error) throw new Error(error.message);

  const items = filtered.map((kit_id, idx) => ({ playlist_id: playlist.id, kit_id, position: idx + 1 }));
  const { error: itemErr } = await supabase.from("playlist_items").insert(items);
  if (itemErr) throw new Error(itemErr.message);
  return playlist;
}

export async function addKitToPlaylist(playlistId: string, kitId: string) {
  const supabase = createSupabaseAdminClient() as any;
  const { data: kit } = await supabase.from("kits").select("id").eq("id", kitId).eq("published", true).maybeSingle();
  if (!kit) throw new Error("Kit inválido.");
  const { data: existing } = await supabase.from("playlist_items").select("id").eq("playlist_id", playlistId).eq("kit_id", kitId).maybeSingle();
  if (existing) return;
  const { count } = await supabase.from("playlist_items").select("id", { count: "exact", head: true }).eq("playlist_id", playlistId);
  if ((count ?? 0) >= MAX_KITS) throw new Error("Limite de 20 kits atingido.");
  await supabase.from("playlist_items").insert({ playlist_id: playlistId, kit_id: kitId, position: (count ?? 0) + 1 });
}

export async function removeKitFromPlaylist(playlistId: string, kitId: string) {
  const supabase = createSupabaseAdminClient() as any;
  await supabase.from("playlist_items").delete().eq("playlist_id", playlistId).eq("kit_id", kitId);
}
