import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { KitForm } from "@/components/admin/kit-form";
import { createKit, ensureArtistCategory, getArtistCategories, getKitFormOptions } from "@/lib/data/kits";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NovoKitPage() {
  const [{ categories, plans }, artistCategories] = await Promise.all([getKitFormOptions(), getArtistCategories()]);

  async function createKitAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();
    const defaultTone = String(formData.get("default_tone") ?? "").trim();

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
      required_plan: String(formData.get("required_plan") ?? "") || null,
      published: formData.get("published") === "on",
      default_tone: defaultTone || null,
    } as any);

    revalidatePath("/admin/kits", "page");
    revalidatePath("/biblioteca", "page");
    revalidatePath("/todos-os-kits", "page");
    redirect("/admin/kits");
  }

  return <KitForm mode="create" categories={categories} artistCategories={artistCategories} plans={plans} action={createKitAction} />;
}
