import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { KitAudioSyncCard } from "@/components/admin/kit-audio-sync-card";
import { KitForm } from "@/components/admin/kit-form";
import { KitLaunchCampaignCard } from "@/components/admin/kit-launch-campaign-card";
import { KitPreviewCard } from "@/components/admin/kit-preview-card";
import { getArtistCategories, getKitById, getKitFormOptions } from "@/lib/data/kits";
import { brazilianNoteToMidi } from "@/lib/music/brazilian-note";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];
const OPTIONAL_KIT_COLUMNS = [
  "allowed_plan_slugs",
  "original_tone",
  "default_tone",
  "allow_pitch_shift",
  "max_pitch_shift_semitones",
  "manual_tessitura_ranges",
  "preview_audio_file_id",
  "preview_start_seconds",
  "preview_duration_seconds",
] as const;
const TESSITURA_VOICES = ["tenor", "contralto", "soprano"] as const;

function parsePitchShiftLimit(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 2);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function parsePreviewSeconds(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function parseAllowedPlanSlugs(formData: FormData, validPlanSlugs: string[]) {
  const valid = new Set(validPlanSlugs);
  const selected = formData.getAll("allowed_plan_slugs").map((value) => String(value).trim().toLowerCase()).filter((value) => valid.has(value));
  return Array.from(new Set(selected.length ? selected : DEFAULT_ALLOWED_PLANS));
}

function normalizeExistingManualTessituraRanges(value: unknown) {
  if (typeof value === "string") {
    try {
      return normalizeExistingManualTessituraRanges(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;

  const ranges: Record<string, { min_midi: number; max_midi: number; source: "manual"; notation: "br" }> = {};
  for (const voice of TESSITURA_VOICES) {
    const range = (value as Record<string, { min_midi?: unknown; max_midi?: unknown }>)[voice];
    const min = range?.min_midi;
    const max = range?.max_midi;
    if (typeof min === "number" && typeof max === "number" && min <= max) ranges[voice] = { min_midi: min, max_midi: max, source: "manual", notation: "br" };
  }

  return Object.keys(ranges).length ? ranges : null;
}

function parseManualTessituraRanges(formData: FormData, existingRanges?: unknown) {
  const ranges: Record<string, { min_midi: number; max_midi: number; source: "manual"; notation: "br" }> = { ...(normalizeExistingManualTessituraRanges(existingRanges) ?? {}) };

  for (const voice of TESSITURA_VOICES) {
    const minRaw = String(formData.get(`manual_tessitura_${voice}_min`) ?? "").trim();
    const maxRaw = String(formData.get(`manual_tessitura_${voice}_max`) ?? "").trim();
    if (!minRaw && !maxRaw) continue;
    if (!minRaw || !maxRaw) {
      console.warn("[admin-kit-edit] manual tessitura incomplete", { voice, minRaw, maxRaw });
      continue;
    }

    const minMidi = brazilianNoteToMidi(minRaw);
    const maxMidi = brazilianNoteToMidi(maxRaw);
    if (typeof minMidi !== "number" || typeof maxMidi !== "number" || minMidi > maxMidi) {
      console.warn("[admin-kit-edit] manual tessitura ignored", { voice, minRaw, maxRaw, minMidi, maxMidi });
      continue;
    }

    ranges[voice] = { min_midi: minMidi, max_midi: maxMidi, source: "manual", notation: "br" };
  }

  return Object.keys(ranges).length ? ranges : null;
}

function resolveLegacyRequiredPlan(allowedPlanSlugs: string[]) {
  if (allowedPlanSlugs.includes("free")) return null;
  if (allowedPlanSlugs.includes("plus")) return "plus";
  if (allowedPlanSlugs.includes("premium")) return "premium";
  return null;
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function isMissingOptionalKitColumnError(message: string) {
  return OPTIONAL_KIT_COLUMNS.some((column) => message.includes(column));
}

function stripOptionalKitColumns<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload };
  for (const column of OPTIONAL_KIT_COLUMNS) delete next[column];
  return next;
}

async function ensureArtistCategoryAdmin(supabase: any, artistName: string) {
  const name = artistName.trim();
  if (!name) throw new Error("Artista é obrigatório.");

  const slug = slugify(name);
  const { data: existing, error: existingError } = await supabase.from("categories").select("id,name,slug").eq("slug", slug).maybeSingle();
  if (existingError) throw new Error(`Falha ao buscar categoria automática: ${existingError.message}`);
  if (existing) return existing;

  const { data, error } = await supabase.from("categories").insert({ name, slug }).select("id,name,slug").single();
  if (error) throw new Error(`Falha ao criar categoria automática: ${error.message}`);
  return data;
}

async function updateKitWithFallback(supabase: any, kitId: string, payload: Record<string, unknown>) {
  const query = (data: Record<string, unknown>) => supabase.from("kits").update(data).eq("id", kitId).select("id,name,slug,published").single();
  const { data, error } = await query(payload);
  if (!error) return data;

  if (isMissingOptionalKitColumnError(error.message)) {
    const { data: fallbackData, error: fallbackError } = await query(stripOptionalKitColumns(payload));
    if (!fallbackError) return fallbackData;
    throw new Error(`Falha ao atualizar kit: ${fallbackError.message}`);
  }

  throw new Error(`Falha ao atualizar kit: ${error.message}`);
}

async function getPreviewAudioFiles(kitId: string) {
  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("kit_audio_files")
    .select("id,name,tone,file_type")
    .eq("kit_id", kitId)
    .order("tone", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.warn("[admin-kit-edit] failed to load preview audio files", error.message);
    return [];
  }

  return (data ?? []) as { id: string; name: string | null; tone: string | null; file_type: string | null }[];
}

export default async function EditarKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [kit, { categories, plans }, artistCategories, previewAudioFiles] = await Promise.all([getKitById(id), getKitFormOptions(), getArtistCategories(), getPreviewAudioFiles(id)]);
  if (!kit) notFound();
  const currentKit = kit;

  async function updateKitAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();
    const originalTone = String(formData.get("original_tone") ?? "").trim();
    const defaultTone = String(formData.get("default_tone") ?? "").trim();
    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));

    if (!name || !slug || !artist) {
      console.error("[admin-kit-edit] missing required fields", { kitId: id, name, slug, artist });
      redirect(`/admin/kits/${id}/editar?saveError=missing_fields`);
    }

    try {
      const supabase = createSupabaseAdminClient() as any;
      const artistCategory = await ensureArtistCategoryAdmin(supabase, artist);
      const manualTessituraRanges = parseManualTessituraRanges(formData, (currentKit as any).manual_tessitura_ranges);

      const payload: Record<string, unknown> = {
        name,
        slug,
        artist,
        description: String(formData.get("description") ?? "").trim() || null,
        lyrics: String(formData.get("lyrics") ?? "").trim() || null,
        cover_url: String(formData.get("cover_url") ?? "").trim() || null,
        r2_folder: String(formData.get("r2_folder") ?? "").trim() || null,
        category_id: String(formData.get("category_id") ?? "") || artistCategory.id,
        required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),
        allowed_plan_slugs: allowedPlanSlugs,
        original_tone: originalTone || null,
        default_tone: defaultTone || originalTone || null,
        allow_pitch_shift: formData.has("allow_pitch_shift"),
        max_pitch_shift_semitones: parsePitchShiftLimit(formData.get("max_pitch_shift_semitones")),
        published: formData.get("published") === "on",
      };

      if (manualTessituraRanges) {
        payload.manual_tessitura_ranges = manualTessituraRanges;
      }

      await updateKitWithFallback(supabase, id, payload);

      revalidatePath("/admin/kits", "page");
      revalidatePath(`/admin/kits/${id}/editar`, "page");
      revalidatePath("/biblioteca", "page");
      revalidatePath("/todos-os-kits", "page");
      revalidatePath(`/biblioteca/${slug}`, "page");
    } catch (error) {
      console.error("[admin-kit-edit] failed", error);
      redirect(`/admin/kits/${id}/editar?saveError=1`);
    }

    redirect(`/admin/kits/${id}/editar?savedAt=${Date.now()}`);
  }

  async function updatePreviewAction(formData: FormData) {
    "use server";

    const previewAudioFileId = String(formData.get("preview_audio_file_id") ?? "").trim() || null;
    const previewStartSeconds = parsePreviewSeconds(formData.get("preview_start_seconds"), 0, 0, 60 * 60 * 3);
    const previewDurationSeconds = parsePreviewSeconds(formData.get("preview_duration_seconds"), 10, 3, 30);

    try {
      const supabase = createSupabaseAdminClient() as any;
      await updateKitWithFallback(supabase, id, {
        preview_audio_file_id: previewAudioFileId,
        preview_start_seconds: previewStartSeconds,
        preview_duration_seconds: previewDurationSeconds,
      });

      revalidatePath("/", "page");
      revalidatePath("/admin/kits", "page");
      revalidatePath(`/admin/kits/${id}/editar`, "page");
      revalidatePath("/biblioteca", "page");
      revalidatePath("/todos-os-kits", "page");
      revalidatePath(`/biblioteca/${currentKit.slug}`, "page");
    } catch (error) {
      console.error("[admin-kit-preview] failed", error);
      redirect(`/admin/kits/${id}/editar?previewError=1`);
    }

    redirect(`/admin/kits/${id}/editar?previewSavedAt=${Date.now()}`);
  }

  return (
    <div className="space-y-6">
      <KitForm mode="edit" categories={categories} artistCategories={artistCategories} plans={plans} initialData={currentKit} action={updateKitAction} />
      <KitPreviewCard
        audioFiles={previewAudioFiles}
        initialAudioFileId={(currentKit as any).preview_audio_file_id ?? null}
        initialStartSeconds={(currentKit as any).preview_start_seconds ?? 0}
        initialDurationSeconds={(currentKit as any).preview_duration_seconds ?? 10}
        action={updatePreviewAction}
      />
      <KitAudioSyncCard kitId={currentKit.id} />
      <KitLaunchCampaignCard kitId={currentKit.id} published={Boolean(currentKit.published)} />
    </div>
  );
}
