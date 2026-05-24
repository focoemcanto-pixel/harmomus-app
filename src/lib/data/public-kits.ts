import { unstable_cache } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type UserTier = "guest" | "free" | "plus" | "premium";
export type VoiceType = "todos" | "tenor" | "contralto" | "soprano";

export interface PublicKitAudioFile {
  id: string;
  tone: string;
  voice: VoiceType;
  name: string;
  audioFileId: string;
  streamUrl: string;
  fileType: string;
}

export interface PublicKitToneGroup {
  tone: string;
  voices: Partial<Record<VoiceType, PublicKitAudioFile>>;
}

export interface PublicKitSearchItem {
  id: string;
  slug: string;
  name: string;
  artist: string;
  category: string;
  searchText: string;
}

export interface PublicKit {
  id: string;
  slug: string;
  name: string;
  artist: string;
  coverUrl: string | null;
  description: string | null;
  lyrics: string | null;
  category: { id: string; name: string; slug: string; description: string | null; cover_url: string | null } | null;
  requiredPlan: { id: string; name: string; slug: string } | null;
  tones: PublicKitToneGroup[];
}

const VOICE_MAP: Record<string, VoiceType> = {
  todos: "todos",
  todosos: "todos",
  tenor: "tenor",
  contralto: "contralto",
  soprano: "soprano",
};

function normalizeVoice(value: string): VoiceType {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  for (const [key, target] of Object.entries(VOICE_MAP)) {
    if (normalized.includes(key)) return target;
  }

  return "todos";
}

function mapKit(
  kit: Database["public"]["Tables"]["kits"]["Row"],
  categoriesMap: Map<string, Database["public"]["Tables"]["categories"]["Row"]>,
  plansMap: Map<string, Database["public"]["Tables"]["plans"]["Row"]>,
  files: Database["public"]["Tables"]["kit_audio_files"]["Row"][],
): PublicKit {
  const tonesMap = new Map<string, PublicKitToneGroup>();

  for (const file of files) {
    if (!tonesMap.has(file.tone)) {
      tonesMap.set(file.tone, { tone: file.tone, voices: {} });
    }

    const voice = normalizeVoice(file.name);

    tonesMap.get(file.tone)!.voices[voice] = {
      id: file.id,
      tone: file.tone,
      voice,
      name: file.name,
      audioFileId: file.id,
      streamUrl: `/api/audio/${file.id}`,
      fileType: file.file_type,
    };
  }

  const category = kit.category_id ? categoriesMap.get(kit.category_id) ?? null : null;
  const requiredPlan = kit.required_plan ? plansMap.get(kit.required_plan) ?? null : null;

  return {
    id: kit.id,
    slug: kit.slug,
    name: kit.name,
    artist: kit.artist,
    coverUrl: kit.cover_url,
    description: kit.description,
    lyrics: kit.lyrics,
    category: category ? { id: category.id, name: category.name, slug: category.slug, description: category.description, cover_url: (category as any).cover_url ?? null } : null,
    requiredPlan: requiredPlan ? { id: requiredPlan.id, name: requiredPlan.name, slug: requiredPlan.slug } : null,
    tones: Array.from(tonesMap.values()).sort((a, b) => a.tone.localeCompare(b.tone, "pt-BR")),
  };
}

function groupFilesByKit(files: Database["public"]["Tables"]["kit_audio_files"]["Row"][]) {
  const map = new Map<string, Database["public"]["Tables"]["kit_audio_files"]["Row"][]>();

  for (const file of files) {
    const list = map.get(file.kit_id) ?? [];
    list.push(file);
    map.set(file.kit_id, list);
  }

  return map;
}

const getPublishedKitsCached = unstable_cache(async (): Promise<PublicKit[]> => {
  const supabase = createSupabaseAdminClient() as any;

  const [{ data: kits }, { data: categories }, { data: plans }, { data: files }] = await Promise.all([
    supabase.from("kits").select("*").eq("published", true).order("created_at", { ascending: false }),
    supabase.from("categories").select("*"),
    supabase.from("plans").select("*"),
    supabase.from("kit_audio_files").select("*"),
  ]);

  const categoriesRows = (categories ?? []) as Database["public"]["Tables"]["categories"]["Row"][];
  const plansRows = (plans ?? []) as Database["public"]["Tables"]["plans"]["Row"][];
  const filesRows = (files ?? []) as Database["public"]["Tables"]["kit_audio_files"]["Row"][];
  const kitsRows = (kits ?? []) as Database["public"]["Tables"]["kits"]["Row"][];

  const categoriesMap = new Map(categoriesRows.map((row) => [row.id, row]));
  const plansMap = new Map(plansRows.map((row) => [row.id, row]));
  const filesByKit = groupFilesByKit(filesRows);

  return kitsRows.map((kit) => mapKit(kit, categoriesMap, plansMap, filesByKit.get(kit.id) ?? []));
}, ["public-kits-cache-v1"], {
  revalidate: 300,
  tags: ["public-catalog"],
});

const getPublishedSearchCached = unstable_cache(async (limit: number): Promise<PublicKitSearchItem[]> => {
  const supabase = createSupabaseAdminClient() as any;

  const { data } = await supabase
    .from("kits")
    .select("id,slug,name,artist,category:categories(name)")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((kit: any) => {
    const category = kit.category?.name ?? "Sem categoria";

    return {
      id: kit.id,
      slug: kit.slug,
      name: kit.name,
      artist: kit.artist,
      category,
      searchText: `${kit.name} ${kit.artist} ${category}`.toLowerCase(),
    };
  });
}, ["public-search-cache-v1"], {
  revalidate: 300,
  tags: ["public-search"],
});

export async function getPublishedKits(): Promise<PublicKit[]> {
  return getPublishedKitsCached();
}

export async function getPublicKits({ limit }: { limit?: number } = {}): Promise<PublicKit[]> {
  const kits = await getPublishedKits();
  return typeof limit === "number" ? kits.slice(0, limit) : kits;
}

export async function getPublishedKitSearchItems(limit = 250): Promise<PublicKitSearchItem[]> {
  return getPublishedSearchCached(limit);
}

export async function getPublishedKitBySlug(slug: string): Promise<PublicKit | null> {
  const kits = await getPublishedKitsCached();
  return kits.find((kit) => kit.slug === slug) ?? null;
}
