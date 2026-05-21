import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { KitForm } from "@/components/admin/kit-form";
import { createKit, getKitFormOptions } from "@/lib/data/kits";

export default async function NovoKitPage() {
  const { categories, plans } = await getKitFormOptions();

  async function createKitAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();

    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");

    await createKit({
      name,
      slug,
      artist,
      description: String(formData.get("description") ?? "").trim() || null,
      cover_url: String(formData.get("cover_url") ?? "").trim() || null,
      r2_folder: String(formData.get("r2_folder") ?? "").trim() || null,
      category_id: String(formData.get("category_id") ?? "") || null,
      required_plan: String(formData.get("required_plan") ?? "") || null,
      published: formData.get("published") === "on",
    });

    revalidatePath("/admin/kits");
    redirect("/admin/kits");
  }

  return <KitForm mode="create" categories={categories} plans={plans} action={createKitAction} />;
}
