import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { KitAudioSyncCard } from "@/components/admin/kit-audio-sync-card";
import { KitBulkUpload } from "@/components/admin/kit-bulk-upload";
import { KitForm } from "@/components/admin/kit-form";
import { createKit, ensureArtistCategory, getArtistCategories, getKitFormOptions, type Kit } from "@/lib/data/kits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];

type NovoKitSearchParams = Promise<Record<string, string | string[] | undefined>>;

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

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function ensureArtistCategoryAdmin(artistName: string) {
  const name = artistName.trim();
  if (!name) throw new Error("Artista é obrigatório.");

  const slug = slugify(name);
  const supabase = createSupabaseAdminClient() as any;

  const { data: existing, error: existingError } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
  if (existingError) throw new Error(`Falha ao buscar categoria automática: ${existingError.message}`);
  if (existing) return existing;

  const { data, error } = await supabase.from("categories").insert({ name, slug }).select("*").single();
  if (error) throw new Error(`Falha ao criar categoria automática: ${error.message}`);
  return data;
}

async function getImportedKitById(id?: string | null): Promise<Kit | null> {
  const kitId = id?.trim();
  if (!kitId) return null;

  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase.from("kits").select("*").eq("id", kitId).maybeSingle();
  if (error) throw new Error(`Falha ao buscar kit importado: ${error.message}`);
  return (data as Kit | null) ?? null;
}

export default async function NovoKitPage({ searchParams }: { searchParams: NovoKitSearchParams }) {
  const resolvedSearchParams = await searchParams;
  const importedKitId = getSingleParam(resolvedSearchParams.importedKitId);

  const [{ categories, plans }, artistCategories, importedKit] = await Promise.all([
    getKitFormOptions(),
    getArtistCategories(),
    getImportedKitById(importedKitId),
  ]);

  async function createKitAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();
    const originalTone = String(formData.get("original_tone") ?? "").trim();
    const defaultTone = String(formData.get("default_tone") ?? "").trim();
    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));

    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");

    const artistCategory = await ensureArtistCategory(artist);

    await createKit({
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
      published: formData.get("published") === "on",
      original_tone: originalTone || null,
      default_tone: defaultTone || originalTone || null,
      allow_pitch_shift: formData.get("allow_pitch_shift") === "on",
      max_pitch_shift_semitones: parsePitchShiftLimit(formData.get("max_pitch_shift_semitones")),
    });

    revalidatePath("/admin/kits", "page");
    revalidatePath("/admin/kits/novo", "page");
    revalidatePath("/biblioteca", "page");
    revalidatePath("/todos-os-kits", "page");
    redirect("/admin/kits");
  }

  async function updateImportedKitAction(formData: FormData) {
    "use server";

    if (!importedKit) throw new Error("Kit importado não encontrado para edição.");

    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();
    const originalTone = String(formData.get("original_tone") ?? "").trim();
    const defaultTone = String(formData.get("default_tone") ?? "").trim();
    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));

    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");

    const artistCategory = await ensureArtistCategoryAdmin(artist);
    const supabase = createSupabaseAdminClient() as any;
    const payload = {
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

    const { error } = await supabase.from("kits").update(payload).eq("id", importedKit.id);
    if (error) throw new Error(`Falha ao salvar kit importado: ${error.message}`);

    revalidatePath("/admin/kits", "page");
    revalidatePath("/admin/kits/novo", "page");
    revalidatePath("/biblioteca", "page");
    revalidatePath("/todos-os-kits", "page");
    revalidatePath(`/biblioteca/${slug}`, "page");
    redirect(`/admin/kits/novo?importedKitId=${importedKit.id}&savedAt=${Date.now()}#kit-editor`);
  }

  const editorLabel = importedKit ? "Editor do kit importado" : "Cadastro manual";

  return (
    <div className="space-y-8">
      <KitBulkUpload />

      <div className="flex items-center gap-4" id="kit-editor">
        <div className="h-px flex-1 bg-border" />
        <span className="rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          {editorLabel}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {importedKit ? (
        <div className="space-y-6">
          <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Kit importado e carregado nesta página. Complete capa, letra, descrição, publicação e configurações vocais abaixo.
          </div>
          <KitForm
            key={importedKit.id}
            mode="edit"
            categories={categories}
            artistCategories={artistCategories}
            plans={plans}
            initialData={importedKit}
            action={updateImportedKitAction}
          />
          <KitAudioSyncCard key={`audio-${importedKit.id}`} kitId={importedKit.id} />
        </div>
      ) : (
        <KitForm mode="create" categories={categories} artistCategories={artistCategories} plans={plans} action={createKitAction} />
      )}
    </div>
  );
}
