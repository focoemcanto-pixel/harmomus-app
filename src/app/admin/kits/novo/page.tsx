import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { KitBulkUpload } from "@/components/admin/kit-bulk-upload";
import { KitForm } from "@/components/admin/kit-form";
import { createKit, ensureArtistCategory, getArtistCategories, getKitFormOptions } from "@/lib/data/kits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_ALLOWED_PLANS = ["free", "plus", "premium"];

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

export default async function NovoKitPage() {
  const [{ categories, plans }, artistCategories] = await Promise.all([getKitFormOptions(), getArtistCategories()]);

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
    revalidatePath("/biblioteca", "page");
    revalidatePath("/todos-os-kits", "page");
    redirect("/admin/kits");
  }

  return (
    <div className="space-y-8">
      <KitBulkUpload />

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-border" />
        <span className="rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Cadastro manual
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <KitForm mode="create" categories={categories} artistCategories={artistCategories} plans={plans} action={createKitAction} />
    </div>
  );
}
