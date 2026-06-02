import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { KitAudioSyncCard } from "@/components/admin/kit-audio-sync-card";
import { KitForm } from "@/components/admin/kit-form";
import { KitLaunchCampaignCard } from "@/components/admin/kit-launch-campaign-card";
import { ensureArtistCategory, getArtistCategories, getKitById, getKitFormOptions, updateKit } from "@/lib/data/kits";

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
  const selected = formData.getAll("allowed_plan_slugs").map((v) => String(v).trim().toLowerCase()).filter((v) => valid.has(v));
  return Array.from(new Set(selected.length ? selected : DEFAULT_ALLOWED_PLANS));
}
function resolveLegacyRequiredPlan(allowedPlanSlugs: string[]) {
  if (allowedPlanSlugs.includes("free")) return null;
  if (allowedPlanSlugs.includes("plus")) return "plus";
  if (allowedPlanSlugs.includes("premium")) return "premium";
  return null;
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

    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");

    const artistCategory = await ensureArtistCategory(artist);

    await updateKit(id, {
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
    redirect("/admin/kits");
  }

  return (
    <div className="space-y-6">
      <KitForm mode="edit" categories={categories} artistCategories={artistCategories} plans={plans} initialData={kit} action={updateKitAction} />
      <KitAudioSyncCard kitId={kit.id} />
      <KitLaunchCampaignCard kitId={kit.id} published={Boolean(kit.published)} />
    </div>
  );
}
