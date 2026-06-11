import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/access/access-engine";
import { getSignedSemitoneDistance, normalizeTone, sortTonesByChromaticOrder } from "@/lib/music/tones";
import type { Database } from "@/types/database";

export type UserTier = "guest" | "free" | "plus" | "premium";
export type VoiceType = "todos" | "tenor" | "contralto" | "soprano";
export type AudioSourceType = "original" | "generated";
export type ManualTessituraVoice = Exclude<VoiceType, "todos">;

export type ManualTessituraRange = {
  min_midi: number;
  max_midi: number;
  source?: "manual";
  notation?: "br";
};

export type ManualTessituraRanges = Partial<Record<ManualTessituraVoice, ManualTessituraRange>>;

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
  absoluteMinMidiNote?: number | null;
  absoluteMaxMidiNote?: number | null;
  dominantMinMidiNote?: number | null;
  dominantMaxMidiNote?: number | null;
  musicalMinMidiNote?: number | null;
  musicalMaxMidiNote?: number | null;
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
  manualTessituraRanges: ManualTessituraRanges | null;
  allowPitchShift: boolean;
  maxPitchShiftSemitones: number;
  previewAudioFileId: string | null;
  previewStartSeconds: number;
  previewDurationSeconds: number;
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

const MANUAL_VOICES: ManualTessituraVoice[] = ["tenor", "contralto", "soprano"];

type MidiRangeJson = {
  min_midi?: number | null;
  max_midi?: number | null;
};

type MusicalLayersJson = {
  musical_range?: MidiRangeJson | null;
  dominant_range?: MidiRangeJson | null;
  absolute_range?: MidiRangeJson | null;
  real_range?: MidiRangeJson | null;
};

type CompletedAnalysisJob = {
  audio_file_id: string | null;
  pitch_events_json?: { musical_layers?: MusicalLayersJson | null } | null;
  detected_min_midi?: number | null;
  detected_max_midi?: number | null;
  vocal_confidence?: number | null;
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

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPreviewSeconds(value: unknown, fallback: number, min: number, max: number) {
  const numeric = getNumber(value);
  if (numeric === null) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeManualTessituraRanges(value: unknown): ManualTessituraRanges | null {
  if (!value || typeof value !== "object") return null;
  const output: ManualTessituraRanges = {};

  for (const voice of MANUAL_VOICES) {
    const range = (value as Record<string, unknown>)[voice];
    if (!range || typeof range !== "object") continue;
    const min = getNumber((range as Record<string, unknown>).min_midi);
    const max = getNumber((range as Record<string, unknown>).max_midi);
    if (min === null || max === null || min > max) continue;
    output[voice] = { min_midi: min, max_midi: max, source: "manual", notation: "br" };
  }

  return Object.keys(output).length ? output : null;
}

function getLatestAnalysisForFile(file: Database["public"]["Tables"]["kit_audio_files"]["Row"], analysisByFileId: Map<string, CompletedAnalysisJob>) {
  return analysisByFileId.get(file.id) ?? null;
}

function resolvePreviewAudioFileId(kit: any, tonesMap: Map<string, PublicKitToneGroup>) {
  const explicit = typeof kit.preview_audio_file_id === "string" && kit.preview_audio_file_id.trim() ? kit.preview_audio_file_id.trim() : null;
  if (explicit) return explicit;

  const preferredTone = normalizeTone(kit.default_tone ?? kit.original_tone ?? "");
  const sortedTones = sortTonesByChromaticOrder(Array.from(tonesMap.keys()));
  const toneGroup = (preferredTone ? tonesMap.get(preferredTone) : null) ?? tonesMap.get(sortedTones[0] ?? "");
  return toneGroup?.voices.todos?.audioFileId ?? null;
}

function mapKit(
  kit: Database["public"]["Tables"]["kits"]["Row"] & {
    original_tone?: string | null;
    default_tone?: string | null;
    allow_pitch_shift?: boolean | null;
    max_pitch_shift_semitones?: number | null;
    manual_tessitura_ranges?: unknown;
  },
  categoriesMap: Map<string, Database["public"]["Tables"]["categories"]["Row"]>,
  plansMap: Map<string, Database["public"]["Tables"]["plans"]["Row"]>,
  files: Database["public"]["Tables"]["kit_audio_files"]["Row"][],
  analysisByFileId = new Map<string, CompletedAnalysisJob>(),
): PublicKit {
  const tonesMap = new Map<string, PublicKitToneGroup>();
  const manualRanges = normalizeManualTessituraRanges((kit as any).manual_tessitura_ranges);
  const originalTone = normalizeTone(kit.original_tone ?? "") ?? null;

  for (const file of files) {
    const tone = normalizeTone(file.tone);
    if (!tone) continue;

    if (!tonesMap.has(tone)) tonesMap.set(tone, { tone, voices: {} });

    const voice = normalizeVoice(file.name);
    const source = normalizeAudioSource((file as any).source_type);
    const manualRange = voice !== "todos" && manualRanges && originalTone ? manualRanges[voice] : null;
    const shift = manualRange && originalTone ? getSignedSemitoneDistance(originalTone, tone) : null;
    const projectedManualRange = manualRange && shift !== null ? { min_midi: manualRange.min_midi + shift, max_midi: manualRange.max_midi + shift } : null;
    const analysis = projectedManualRange ? null : getLatestAnalysisForFile(file, analysisByFileId);
    const musicalLayers = analysis?.pitch_events_json?.musical_layers ?? null;
    const musicalRange = musicalLayers?.musical_range ?? null;
    const dominantRange = musicalLayers?.dominant_range ?? null;
    const absoluteRange = musicalLayers?.absolute_range ?? musicalLayers?.real_range ?? null;
    const musicalMin = getNumber(musicalRange?.min_midi);
    const musicalMax = getNumber(musicalRange?.max_midi);
    const absoluteMin = getNumber(absoluteRange?.min_midi) ?? getNumber(analysis?.detected_min_midi);
    const absoluteMax = getNumber(absoluteRange?.max_midi) ?? getNumber(analysis?.detected_max_midi);

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
      minMidiNote: projectedManualRange?.min_midi ?? musicalMin ?? (file as any).min_midi_note ?? null,
      maxMidiNote: projectedManualRange?.max_midi ?? musicalMax ?? (file as any).max_midi_note ?? null,
      detectedMinMidiNote: projectedManualRange?.min_midi ?? musicalMin ?? (file as any).detected_min_midi_note ?? null,
      detectedMaxMidiNote: projectedManualRange?.max_midi ?? musicalMax ?? (file as any).detected_max_midi_note ?? null,
      absoluteMinMidiNote: absoluteMin,
      absoluteMaxMidiNote: absoluteMax,
      dominantMinMidiNote: getNumber(dominantRange?.min_midi),
      dominantMaxMidiNote: getNumber(dominantRange?.max_midi),
      musicalMinMidiNote: projectedManualRange?.min_midi ?? musicalMin,
      musicalMaxMidiNote: projectedManualRange?.max_midi ?? musicalMax,
      tessituraConfidence: projectedManualRange ? 1 : analysis?.vocal_confidence ?? (file as any).tessitura_confidence ?? null,
      tessituraSource: projectedManualRange ? "manual" : analysis ? "hybrid" : (file as any).tessitura_source ?? "manual",
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
    manualTessituraRanges: manualRanges,
    allowPitchShift: kit.allow_pitch_shift ?? true,
    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,
    previewAudioFileId: resolvePreviewAudioFileId(kit as any, tonesMap),
    previewStartSeconds: clampPreviewSeconds((kit as any).preview_start_seconds, 0, 0, 60 * 60 * 3),
    previewDurationSeconds: clampPreviewSeconds((kit as any).preview_duration_seconds, 10, 3, 30),
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

function groupAnalysesByFileId(rows: CompletedAnalysisJob[]) {
  const map = new Map<string, CompletedAnalysisJob>();
  for (const row of rows) {
    if (!row.audio_file_id) continue;
    if (map.has(row.audio_file_id)) continue;
    map.set(row.audio_file_id, row);
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

  const hasManualTessitura = Boolean(normalizeManualTessituraRanges((kit as any).manual_tessitura_ranges));
  const [{ data: category, error: categoryError }, { data: plans, error: plansError }, { data: files, error: filesError }, { data: analyses, error: analysesError }] = await Promise.all([
    kit.category_id ? supabase.from("categories").select("*").eq("id", kit.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("plans").select("*"),
    supabase.from("kit_audio_files").select("*").eq("kit_id", kit.id).order("tone", { ascending: true }),
    hasManualTessitura
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("audio_analysis_jobs")
          .select("audio_file_id,pitch_events_json,detected_min_midi,detected_max_midi,vocal_confidence,completed_at")
          .eq("kit_id", kit.id)
          .eq("analysis_type", "tessitura")
          .eq("status", "completed")
          .order("completed_at", { ascending: false }),
  ]);

  if (categoryError) throw new Error(`Falha ao buscar categoria: ${categoryError.message}`);
  if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);
  if (filesError) throw new Error(`Falha ao buscar áudios do kit: ${filesError.message}`);
  if (analysesError) console.warn("[public-kits] falha ao buscar análises IA", analysesError.message);

  const categoriesMap = new Map<string, Database["public"]["Tables"]["categories"]["Row"]>();
  if (category) categoriesMap.set(category.id, category as Database["public"]["Tables"]["categories"]["Row"]);
  const plansRows = (plans ?? []) as Database["public"]["Tables"]["plans"]["Row"][];
  const plansMap = new Map(plansRows.map((row) => [row.id, row]));
  const analysisByFileId = groupAnalysesByFileId((analyses ?? []) as CompletedAnalysisJob[]);

  return mapKit(
    kit as Database["public"]["Tables"]["kits"]["Row"] & any,
    categoriesMap,
    plansMap,
    (files ?? []) as Database["public"]["Tables"]["kit_audio_files"]["Row"][],
    analysisByFileId,
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
  return getPublishedKitById(kit.id);
}
