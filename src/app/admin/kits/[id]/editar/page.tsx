import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { KitAudioSyncCard } from "@/components/admin/kit-audio-sync-card";
import { KitForm } from "@/components/admin/kit-form";
import { KitLaunchCampaignCard } from "@/components/admin/kit-launch-campaign-card";
import { getArtistCategories, getKitById, getKitFormOptions } from "@/lib/data/kits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];
const OPTIONAL_KIT_COLUMNS = ["allowed_plan_slugs", "original_tone", "default_tone", "allow_pitch_shift", "max_pitch_shift_semitones"] as const;

function parsePitchShiftLimit(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 2);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function parseAllowedPlanSlugs(formData: FormData, validPlanSlugs: string[]) {
  const valid = new Set(validPlanSlugs);
  const selected = formData
    .getAll("allowed_plan_slugs")
    .map((value) => String(value).trim().toLowerCase())
    .filter((value) => valid.has(value));

  return Array.from(new Set(selected.length ? selected : DEFAULT_ALLOWED_PLANS));
}

function resolveLegacyRequiredPlan(allowedPlanSlugs: string[]) {
  if (allowedPlanSlugs.includes("free")) return null;
  if (allowedPlanSlugs.includes("plus")) return "plus";
  if (allowedPlanSlugs.includes("premium")) return "premium";
  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
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
  const { data: existing, error: existingError } = await supabase
    .from("categories")
    .select("id,name,slug")
    .eq("slug", slug)
    .maybeSingle();

  if (existingError) throw new Error(`Falha ao buscar categoria automática: ${existingError.message}`);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("categories")
    .insert({ name, slug })
    .select("id,name,slug")
    .single();

  if (error) throw new Error(`Falha ao criar categoria automática: ${error.message}`);
  return data;
}

async function updateKitWithFallback(supabase: any, kitId: string, payload: Record<string, unknown>) {
  const query = (data: Record<string, unknown>) => supabase
    .from("kits")
    .update(data)
    .eq("id", kitId)
    .select("id,name,slug,published")
    .single();

  const { data, error } = await query(payload);
  if (!error) return data;

  if (isMissingOptionalKitColumnError(error.message)) {
    const fallbackPayload = stripOptionalKitColumns(payload);
    const { data: fallbackData, error: fallbackError } = await query(fallbackPayload);
    if (!fallbackError) return fallbackData;
    throw new Error(`Falha ao atualizar kit: ${fallbackError.message}`);
  }

  throw new Error(`Falha ao atualizar kit: ${error.message}`);
}

export default async function EditarKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [kit, { categories, plans }, artistCategories] = await Promise.all([getKitById(id), getKitFormOptions(), getArtistCategories()]);
  if (!kit) notFound();

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

      await updateKitWithFallback(supabase, id, {
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
      });

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

  return (
    <div className="space-y-6">
      <KitForm mode="edit" categories={categories} artistCategories={artistCategories} plans={plans} initialData={kit} action={updateKitAction} />
      <KitAudioSyncCard kitId={kit.id} />
      <KitLaunchCampaignCard kitId={kit.id} published={Boolean(kit.published)} />
    </div>
  );
}
