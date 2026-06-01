import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { KitAudioToneGroup } from "@/types/kit-audio";

export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Kit = Database["public"]["Tables"]["kits"]["Row"] & {
  original_tone?: string | null;
  default_tone?: string | null;
  allow_pitch_shift?: boolean | null;
  max_pitch_shift_semitones?: number | null;
};

type KitToneMetadata = {
  original_tone?: string | null;
  default_tone?: string | null;
  allow_pitch_shift?: boolean | null;
  max_pitch_shift_semitones?: number | null;
};

type KitInsert = Database["public"]["Tables"]["kits"]["Insert"] & KitToneMetadata;
type KitUpdate = Database["public"]["Tables"]["kits"]["Update"] & KitToneMetadata;

export interface KitListItem extends Kit {
  category_name: string | null;
  plan_name: string | null;
  tone_count: number;
  file_count: number;
}

const AUDIO_BASE_COLUMNS = "id,r2_key,source_type,generated_from_file_id";
const AUDIO_TESSITURA_COLUMNS = `${AUDIO_BASE_COLUMNS},min_midi_note,max_midi_note,detected_min_midi_note,detected_max_midi_note,tessitura_confidence,tessitura_source`;
const KIT_TONE_COLUMNS = ["original_tone", "default_tone", "allow_pitch_shift", "max_pitch_shift_semitones"] as const;

function isMissingKitToneColumnError(message: string) {
  return KIT_TONE_COLUMNS.some((column) => message.includes(column));
}

function stripKitToneColumns<T extends Record<string, unknown>>(data: T): Omit<T, (typeof KIT_TONE_COLUMNS)[number]> {
  const next = { ...data };
  for (const column of KIT_TONE_COLUMNS) delete next[column];
  return next;
}

export async function getKits(): Promise<KitListItem[]> {
  const supabase = (await createClient()) as any;
  const [{ data: kits, error: kitsError }, { data: categories, error: categoriesError }, { data: plans, error: plansError }, { data: audioFiles, error: audioFilesError }] = await Promise.all([
    supabase.from("kits").select("*").order("created_at", { ascending: false }),
    supabase.from("categories").select("id,name"),
    supabase.from("plans").select("slug,name"),
    supabase.from("kit_audio_files").select("kit_id,tone"),
  ]);
  if (kitsError) throw new Error(`Falha ao buscar kits: ${kitsError.message}`);
  if (categoriesError) throw new Error(`Falha ao buscar categorias: ${categoriesError.message}`);
  if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);
  if (audioFilesError) throw new Error(`Falha ao buscar áudios sincronizados: ${audioFilesError.message}`);
  const categoriesMap = new Map(((categories ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const plansMap = new Map(((plans ?? []) as { slug: string; name: string }[]).map((p) => [p.slug, p.name]));
  const audioStats = new Map<string, { tones: Set<string>; count: number }>();
  for (const row of (audioFiles ?? []) as { kit_id: string; tone: string }[]) {
    if (!audioStats.has(row.kit_id)) audioStats.set(row.kit_id, { tones: new Set(), count: 0 });
    const stats = audioStats.get(row.kit_id)!;
    stats.tones.add(row.tone);
    stats.count += 1;
  }
  return ((kits ?? []) as Kit[]).map((kit) => {
    const stats = audioStats.get(kit.id);
    return {
      ...kit,
      category_name: kit.category_id ? categoriesMap.get(kit.category_id) ?? null : null,
      plan_name: kit.required_plan ? plansMap.get(kit.required_plan) ?? kit.required_plan : null,
      tone_count: stats?.tones.size ?? 0,
      file_count: stats?.count ?? 0,
    };
  });
}

export async function getKitById(id: string): Promise<Kit | null> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("kits").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Falha ao buscar kit: ${error.message}`);
  return (data as Kit | null) ?? null;
}

export async function createKit(data: KitInsert): Promise<Kit> {
  const supabase = (await createClient()) as any;
  const { data: created, error } = await supabase.from("kits").insert(data as any).select("*").single();

  if (!error) return created as Kit;

  if (isMissingKitToneColumnError(error.message)) {
    const { data: fallbackCreated, error: fallbackError } = await supabase
      .from("kits")
      .insert(stripKitToneColumns(data as Record<string, unknown>) as any)
      .select("*")
      .single();

    if (fallbackError) throw new Error(`Falha ao criar kit: ${fallbackError.message}`);
    return fallbackCreated as Kit;
  }

  throw new Error(`Falha ao criar kit: ${error.message}`);
}

export async function updateKit(id: string, data: KitUpdate): Promise<Kit> {
  const supabase = (await createClient()) as any;
  const { data: updated, error } = await supabase.from("kits").update(data as any).eq("id", id).select("*").single();

  if (!error) return updated as Kit;

  if (isMissingKitToneColumnError(error.message)) {
    const { data: fallbackUpdated, error: fallbackError } = await supabase
      .from("kits")
      .update(stripKitToneColumns(data as Record<string, unknown>) as any)
      .eq("id", id)
      .select("*")
      .single();

    if (fallbackError) throw new Error(`Falha ao atualizar kit: ${fallbackError.message}`);
    return fallbackUpdated as Kit;
  }

  throw new Error(`Falha ao atualizar kit: ${error.message}`);
}

export async function deleteKit(id: string): Promise<void> {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("kits").delete().eq("id", id);
  if (error) throw new Error(`Falha ao remover kit: ${error.message}`);
}

export async function getKitFormOptions(): Promise<{ categories: Category[]; plans: Plan[] }> {
  const supabase = (await createClient()) as any;
  const [{ data: categories, error: categoriesError }, { data: plans, error: plansError }] = await Promise.all([
    supabase.from("categories").select("*").order("name"),
    supabase.from("plans").select("*").eq("status", "active").order("price_cents"),
  ]);
  if (categoriesError) throw new Error(`Falha ao buscar categorias: ${categoriesError.message}`);
  if (plansError) throw new Error(`Falha ao buscar planos: ${plansError.message}`);
  return { categories: (categories ?? []) as Category[], plans: (plans ?? []) as Plan[] };
}

export async function getArtistCategories(): Promise<Category[]> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw new Error(`Falha ao buscar artistas: ${error.message}`);
  return (data ?? []) as Category[];
}

export async function ensureArtistCategory(artistName: string): Promise<Category> {
  const name = artistName.trim();
  if (!name) throw new Error("Artista é obrigatório.");
  const slug = name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
  const supabase = (await createClient()) as any;
  const { data: existing } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
  if (existing) return existing as Category;
  const { data, error } = await supabase.from("categories").insert({ name, slug }).select("*").single();
  if (error) throw new Error(`Falha ao criar categoria automática: ${error.message}`);
  return data as Category;
}

async function getExistingAudioFilesForSync(supabase: any, kitId: string) {
  const { data, error } = await supabase
    .from("kit_audio_files")
    .select(AUDIO_TESSITURA_COLUMNS)
    .eq("kit_id", kitId);

  if (!error) return { files: data ?? [], hasTessituraColumns: true };

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("kit_audio_files")
    .select(AUDIO_BASE_COLUMNS)
    .eq("kit_id", kitId);

  if (fallbackError) throw new Error(fallbackError.message);

  return { files: fallbackData ?? [], hasTessituraColumns: false };
}

function buildAudioSyncRow({
  kitId,
  tone,
  file,
  existing,
  hasTessituraColumns,
  sourceType,
  generatedFromFileId,
}: {
  kitId: string;
  tone: string;
  file: KitAudioToneGroup["files"][number];
  existing: any;
  hasTessituraColumns: boolean;
  sourceType: "original" | "generated";
  generatedFromFileId: string | null;
}) {
  const baseRow = {
    id: existing?.id,
    kit_id: kitId,
    tone,
    name: file.name,
    r2_key: file.key,
    public_url: file.url,
    file_type: file.fileType,
    source_type: sourceType,
    generated_from_file_id: generatedFromFileId,
  };

  if (!hasTessituraColumns) return baseRow;

  return {
    ...baseRow,
    min_midi_note: existing?.min_midi_note ?? null,
    max_midi_note: existing?.max_midi_note ?? null,
    detected_min_midi_note: existing?.detected_min_midi_note ?? null,
    detected_max_midi_note: existing?.detected_max_midi_note ?? null,
    tessitura_confidence: existing?.tessitura_confidence ?? null,
    tessitura_source: existing?.tessitura_source ?? "manual",
  };
}

export async function saveKitAudioSync(kitId: string, tones: KitAudioToneGroup[]): Promise<void> {
  const supabase = (await createClient()) as any;

  const { files: existingFiles, hasTessituraColumns } = await getExistingAudioFilesForSync(supabase, kitId);

  const { data: completedJobs, error: completedJobsError } = await supabase
    .from("audio_generation_jobs")
    .select("target_r2_key,source_audio_file_id")
    .eq("kit_id", kitId)
    .eq("status", "completed");

  if (completedJobsError) {
    throw new Error(`Falha ao buscar jobs de geração concluídos: ${completedJobsError.message}`);
  }

  const generatedByKey = new Map(
    ((completedJobs ?? []) as any[])
      .filter((job) => typeof job.target_r2_key === "string" && job.target_r2_key.trim())
      .map((job) => [job.target_r2_key, job.source_audio_file_id ?? null]),
  );

  const existingMap = new Map(
    ((existingFiles ?? []) as any[]).map((file) => [file.r2_key, file]),
  );

  const rows = tones.flatMap((toneGroup) =>
    toneGroup.files.map((file) => {
      const generatedFromFileId = generatedByKey.get(file.key) ?? null;
      return buildAudioSyncRow({
        kitId,
        tone: toneGroup.tone,
        file,
        existing: existingMap.get(file.key),
        hasTessituraColumns,
        sourceType: generatedByKey.has(file.key) ? "generated" : "original",
        generatedFromFileId,
      });
    }),
  );

  if (rows.length === 0) {
    const { error: deleteAllError } = await supabase
      .from("kit_audio_files")
      .delete()
      .eq("kit_id", kitId);

    if (deleteAllError) {
      throw new Error(`Falha ao limpar áudios removidos: ${deleteAllError.message}`);
    }

    return;
  }

  const { error: deleteError } = await supabase
    .from("kit_audio_files")
    .delete()
    .eq("kit_id", kitId)
    .not("r2_key", "in", `(${rows.map((row) => `"${row.r2_key}"`).join(",")})`);

  if (deleteError) {
    throw new Error(`Falha ao limpar áudios removidos: ${deleteError.message}`);
  }

  const { error: upsertError } = await supabase
    .from("kit_audio_files")
    .upsert(rows, {
      onConflict: "id",
    });

  if (upsertError) {
    throw new Error(`Falha ao salvar áudios sincronizados: ${upsertError.message}`);
  }
}
