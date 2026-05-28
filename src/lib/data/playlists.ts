import { canSavePlaylist } from "@/lib/access/access-engine";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";
import { createClient } from "@/lib/supabase/server";

const MAX_KITS = 20;

async function ensurePlaylistAccess() {
  const current = await getCurrentUserAccessContext();

  if (!canSavePlaylist(current.effectiveSlug)) {
    throw new Error("Playlists disponíveis apenas para Plus e Premium.");
  }

  return current;
}

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
    minMidiNote: number | null;
    maxMidiNote: number | null;
    detectedMinMidiNote: number | null;
    detectedMaxMidiNote: number | null;
    tessituraConfidence: number | null;
    tessituraSource: "manual" | "auto" | "hybrid";
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
  kits: { id: string; name: string; artist: string; cover_url: string | null }[];
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
    const normalizedKits = playlistItems.map((item: any) => ({
      id: item.kits.id,
      name: item.kits.name,
      artist: item.kits.artist,
      cover_url: item.kits.cover_url,
    }));

    return {
      id: playlist.id,
      name: playlist.name,
      slug: playlist.slug,
      isPublic: Boolean(playlist.is_public),
      createdAt: playlist.created_at,
      kitCount: playlistItems.length,
      covers: normalizedKits.slice(0, 4),
      kits: normalizedKits,
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

async function getPlaylistItems(supabase: any, playlistId: string) {
  const toneSelect = "position, kits!inner(id, slug, name, artist, cover_url, category_id, original_tone, default_tone, allow_pitch_shift, max_pitch_shift_semitones, published)";
  const baseSelect = "position, kits!inner(id, slug, name, artist, cover_url, category_id, published)";

  const { data, error } = await supabase
    .from("playlist_items")
    .select(toneSelect)
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true });

  if (!error) return data ?? [];

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("playlist_items")
    .select(baseSelect)
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true });

  if (fallbackError) throw new Error(fallbackError.message);
  return fallbackData ?? [];
}
