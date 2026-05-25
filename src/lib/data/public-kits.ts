import { createClient } from "@/lib/supabase/server";
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
  originalTone: string | null;
  defaultTone: string | null;
  allowPitchShift: boolean;
  maxPitchShiftSemitones: number;
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

function getAudioStreamUrl(file: Database["public"]["Tables"]["kit_audio_files"]["Row"]) {
  return `/api/audio/${file.id}`;
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
    if (!tonesMap.has(file.tone)) tonesMap.set(file.tone, { tone: file.tone, voices: {} });
    const voice = normalizeVoice(file.name);
    tonesMap.get(file.tone)!.voices[voice] = {
      id: file.id,
      tone: file.tone,
      voice,
      name: file.name,
      audioFileId: file.id,
      streamUrl: getAudioStreamUrl(file),
      fileType: file.file_type,
      minMidiNote: (file as any).min_midi_note ?? null,
      maxMidiNote: (file as any).max_midi_note ?? null,
      detectedMinMidiNote: (file as any).detected_min_midi_note ?? null,
      detectedMaxMidiNote: (file as any).detected_max_midi_note ?? null,
      tessituraConfidence: (file as any).tessitura_confidence ?? null,
      tessituraSource: (file as any).tessitura_source ?? "manual",
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
    originalTone: kit.original_tone ?? null,
    defaultTone: kit.default_tone ?? kit.original_tone ?? null,
    allowPitchShift: kit.allow_pitch_shift ?? true,
    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,
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

async function getPublicClient() {
  return (await createClient()) as any;
}

export async function getPublishedKits(): Promise<PublicKit[]> {
  const supabase = await getPublicClient();
  const [{ data: kits, error: kitsError }, { data: categories, error: categoriesError }, { data: plans, error: plansError }, { data: files, error: filesError }] = await Promise.all([
    supabase.from("kits").select("*").eq("published", true).order("created_at", { ascending: false }),
    supabase.from("categories").select("*"),
    supabase.from("plans").select("*"),
    supabase.from("kit_audio_files").select("*"),
  ]);

  if (kitsError) throw new Error(`Falha ao buscar kits públicos: ${kitsError.message}`);
  if (categoriesError) throw new Error(`Falha ao buscar categorias: ${categoriesError.message}`);
  if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);
  if (filesError) throw new Error(`Falha ao buscar áudios: ${filesError.message}`);

  const categoriesRows = (categories ?? []) as Database["public"]["Tables"]["categories"]["Row"][];
  const plansRows = (plans ?? []) as Database["public"]["Tables"]["plans"]["Row"][];
  const filesRows = (files ?? []) as Database["public"]["Tables"]["kit_audio_files"]["Row"][];
  const kitsRows = (kits ?? []) as (Database["public"]["Tables"]["kits"]["Row"] & any)[];
  const categoriesMap = new Map(categoriesRows.map((row) => [row.id, row]));
  const plansMap = new Map(plansRows.map((row) => [row.id, row]));
  const filesByKit = groupFilesByKit(filesRows);
  return kitsRows.map((kit) => mapKit(kit, categoriesMap, plansMap, filesByKit.get(kit.id) ?? []));
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
    return { id: kit.id, slug: kit.slug, name: kit.name, artist: kit.artist, category, searchText: `${kit.name} ${kit.artist} ${category}`.toLowerCase() };
  });
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
