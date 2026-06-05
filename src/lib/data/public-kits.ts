import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/access/access-engine";
import { normalizeTone, sortTonesByChromaticOrder } from "@/lib/music/tones";
import type { Database } from "@/types/database";

export type UserTier = "guest" | "free" | "plus" | "premium";
export type VoiceType = "todos" | "tenor" | "contralto" | "soprano";
export type AudioSourceType = "original" | "generated";

export interface PublicKitAudioFile {
  id: string;
  tone: string;
  voice: VoiceType;
  name: string;
  audioFileId: string;
  streamUrl: string;
  fileType: string;
  source_type: AudioSourceType;
  source: AudioSourceType;
  isGenerated: boolean;
  minMidiNote: number | null;
  maxMidiNote: number | null;
  detectedMinMidiNote: number | null;
  detectedMaxMidiNote: number | null;
  tessituraConfidence: number | null;
  tessituraSource: "manual" | "auto" | "hybrid";
}

export interface PublicKitToneGroup {
  tone: string;
  voices: Partial<Record<VoiceType, PublicKitAudioFile>>;
}

export interface PublicKitSearchItem {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  category: string;
  searchText: string;
}

export interface PublicKit {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  coverUrl: string | null;
  description: string | null;
  lyrics: string | null;
  originalTone: string | null;
  defaultTone: string | null;
  allowPitchShift: boolean;
  maxPitchShiftSemitones: number;
  category: { id: string; name: string; slug: string; description: string | null; cover_url: string | null } | null;
  requiredPlan: { id: string; name: string; slug: string } | null;
  allowedPlanSlugs: string[];
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

function normalizeAudioSource(value: unknown): AudioSourceType {
  return value === "generated" ? "generated" : "original";
}

function getAudioStreamUrl(file: Database["public"]["Tables"]["kit_audio_files"]["Row"]) {
  return `/api/audio/${file.id}`;
}

function resolveRequiredPlan(
  kit: Database["public"]["Tables"]["kits"]["Row"],
  plansMap: Map<string, Database["public"]["Tables"]["plans"]["Row"]>,
) {
  const raw = String((kit as any).required_plan ?? "").trim();
  if (!raw) return null;
  return plansMap.get(raw) ?? Array.from(plansMap.values()).find((plan) => plan.slug === raw) ?? null;
}

function mapKit(
  kit: Database["public"]["Tables"]["kits"]["Row"] & {
    original_tone?: string | null;
    default_tone?: string | null;
    allow_pitch_shift?: boolean | null;
    max_pitch_shift_semitones?: number | null;
  },
  categoriesMap: Map<string, Database["public"]["Tables"]["categories"]["Row"]>,
  plansMap: Map<string, Database["public"]["Tables"]["plans"]["Row"]>,
  files: Database["public"]["Tables"]["kit_audio_files"]["Row"][],
): PublicKit {
  const tonesMap = new Map<string, PublicKitToneGroup>();

  for (const file of files) {
    const tone = normalizeTone(file.tone);
    if (!tone) continue;

    if (!tonesMap.has(tone)) tonesMap.set(tone, { tone, voices: {} });

    const voice = normalizeVoice(file.name);
    const source = normalizeAudioSource((file as any).source_type);
    tonesMap.get(tone)!.voices[voice] = {
      id: file.id,
      tone,
      voice,
      name: file.name,
      audioFileId: file.id,
      streamUrl: getAudioStreamUrl(file),
      fileType: file.file_type,
      source_type: source,
      source,
      isGenerated: source === "generated",
      minMidiNote: (file as any).min_midi_note ?? null,
      maxMidiNote: (file as any).max_midi_note ?? null,
      detectedMinMidiNote: (file as any).detected_min_midi_note ?? null,
      detectedMaxMidiNote: (file as any).detected_max_midi_note ?? null,
      tessituraConfidence: (file as any).tessitura_confidence ?? null,
      tessituraSource: (file as any).tessitura_source ?? "manual",
    };
  }

  const category = kit.category_id ? categoriesMap.get(kit.category_id) ?? null : null;
  const requiredPlan = resolveRequiredPlan(kit, plansMap);
  const allowedPlanSlugs: string[] = Array.isArray((kit as any).allowed_plan_slugs) && (kit as any).allowed_plan_slugs.length
    ? Array.from(new Set(((kit as any).allowed_plan_slugs as unknown[]).map((slug) => normalizePlan(slug))))
    : requiredPlan?.slug === "premium"
      ? ["premium"]
      : requiredPlan?.slug === "plus"
        ? ["plus", "premium"]
        : ["free", "plus", "premium"];

  return {
    id: kit.id,
    slug: kit.slug,
    name: kit.name,
    artist: kit.artist,
    coverUrl: kit.cover_url,
    description: kit.description,
    lyrics: kit.lyrics,
    originalTone: normalizeTone(kit.original_tone ?? "") ?? kit.original_tone ?? null,
    defaultTone: normalizeTone(kit.default_tone ?? kit.original_tone ?? "") ?? kit.default_tone ?? kit.original_tone ?? null,
    allowPitchShift: kit.allow_pitch_shift ?? true,
    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,
    category: category ? { id: category.id, name: category.name, slug: category.slug, description: category.description, cover_url: (category as any).cover_url ?? null } : null,
    requiredPlan: requiredPlan ? { id: requiredPlan.id, name: requiredPlan.name, slug: requiredPlan.slug } : null,
    allowedPlanSlugs,
    tones: sortTonesByChromaticOrder(Array.from(tonesMap.keys())).map((tone) => tonesMap.get(tone)!).filter(Boolean),
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

async function getPublicClient() {
  return (await createClient()) as any;
}

async function getPlanAndCategoryMaps(supabase: any) {
  const [{ data: categories, error: categoriesError }, { data: plans, error: plansError }] = await Promise.all([
    supabase.from("categories").select("*"),
    supabase.from("plans").select("*"),
  ]);

  if (categoriesError) throw new Error(`Falha ao buscar categorias: ${categoriesError.message}`);
  if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);

  const categoriesRows = (categories ?? []) as Database["public"]["Tables"]["categories"]["Row"][];
  const plansRows = (plans ?? []) as Database["public"]["Tables"]["plans"]["Row"][];
  return {
    categoriesMap: new Map(categoriesRows.map((row) => [row.id, row])),
    plansMap: new Map(plansRows.map((row) => [row.id, row])),
  };
}

export async function getPublishedKits(): Promise<PublicKit[]> {
  const supabase = await getPublicClient();
  const [{ data: kits, error: kitsError }, maps] = await Promise.all([
    supabase.from("kits").select("*").eq("published", true).order("created_at", { ascending: false }),
    getPlanAndCategoryMaps(supabase),
  ]);

  if (kitsError) throw new Error(`Falha ao buscar kits públicos: ${kitsError.message}`);

  const kitsRows = (kits ?? []) as (Database["public"]["Tables"]["kits"]["Row"] & any)[];
  return kitsRows.map((kit) => mapKit(kit, maps.categoriesMap, maps.plansMap, []));
}

export async function getPublicKits({ limit }: { limit?: number } = {}): Promise<PublicKit[]> {
  const kits = await getPublishedKits();
  return typeof limit === "number" ? kits.slice(0, limit) : kits;
}

export async function getPublishedKitSearchItems(limit = 250): Promise<PublicKitSearchItem[]> {
  const supabase = await getPublicClient();
  const { data, error } = await supabase
    .from("kits")
    .select("id,slug,name,artist,category:categories(name)")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Falha ao buscar busca pública: ${error.message}`);
  return (data ?? []).map((kit: any) => {
    const category = kit.category?.name ?? "Sem categoria";
    return { id: kit.id, slug: kit.slug, name: kit.name, artist: kit.artist, category, searchText: `${kit.name} ${kit.artist ?? ""} ${category}`.toLowerCase() };
  });
}


export async function getPublishedKitById(id: string): Promise<PublicKit | null> {
  const supabase = await getPublicClient();
  const { data: kit, error: kitError } = await supabase
    .from("kits")
    .select("*")
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();

  if (kitError) throw new Error(`Falha ao buscar kit: ${kitError.message}`);
  if (!kit) return null;

  const [{ data: category, error: categoryError }, { data: plans, error: plansError }, { data: files, error: filesError }] = await Promise.all([
    kit.category_id ? supabase.from("categories").select("*").eq("id", kit.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("plans").select("*"),
    supabase.from("kit_audio_files").select("*").eq("kit_id", kit.id).order("tone", { ascending: true }),
  ]);

  if (categoryError) throw new Error(`Falha ao buscar categoria: ${categoryError.message}`);
  if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);
  if (filesError) throw new Error(`Falha ao buscar áudios do kit: ${filesError.message}`);

  const categoriesMap = new Map<string, Database["public"]["Tables"]["categories"]["Row"]>();
  if (category) categoriesMap.set(category.id, category as Database["public"]["Tables"]["categories"]["Row"]);
  const plansRows = (plans ?? []) as Database["public"]["Tables"]["plans"]["Row"][];
  const plansMap = new Map(plansRows.map((row) => [row.id, row]));

  return mapKit(
    kit as Database["public"]["Tables"]["kits"]["Row"] & any,
    categoriesMap,
    plansMap,
    (files ?? []) as Database["public"]["Tables"]["kit_audio_files"]["Row"][],
  );
}

export async function getPublishedKitBySlug(slug: string): Promise<PublicKit | null> {
  const supabase = await getPublicClient();
  const { data: kit, error: kitError } = await supabase
    .from("kits")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (kitError) throw new Error(`Falha ao buscar kit: ${kitError.message}`);
  if (!kit) return null;

  const [{ data: category, error: categoryError }, { data: plans, error: plansError }, { data: files, error: filesError }] = await Promise.all([
    kit.category_id ? supabase.from("categories").select("*").eq("id", kit.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("plans").select("*"),
    supabase.from("kit_audio_files").select("*").eq("kit_id", kit.id).order("tone", { ascending: true }),
  ]);

  if (categoryError) throw new Error(`Falha ao buscar categoria: ${categoryError.message}`);
  if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);
  if (filesError) throw new Error(`Falha ao buscar áudios do kit: ${filesError.message}`);

  const categoriesMap = new Map<string, Database["public"]["Tables"]["categories"]["Row"]>();
  if (category) categoriesMap.set(category.id, category as Database["public"]["Tables"]["categories"]["Row"]);
  const plansRows = (plans ?? []) as Database["public"]["Tables"]["plans"]["Row"][];
  const plansMap = new Map(plansRows.map((row) => [row.id, row]));

  return mapKit(
    kit as Database["public"]["Tables"]["kits"]["Row"] & any,
    categoriesMap,
    plansMap,
    (files ?? []) as Database["public"]["Tables"]["kit_audio_files"]["Row"][],
  );
}
