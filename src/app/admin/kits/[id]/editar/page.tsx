import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { KitAudioSyncCard } from "@/components/admin/kit-audio-sync-card";
import { KitForm } from "@/components/admin/kit-form";
import { getKitById, getKitFormOptions, updateKit } from "@/lib/data/kits";

export default async function EditarKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [kit, { categories, plans }] = await Promise.all([getKitById(id), getKitFormOptions()]);
  if (!kit) notFound();

  async function updateKitAction(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();

    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");

    await updateKit(id, {
      name,
      slug,
      artist,
      description: String(formData.get("description") ?? "").trim() || null,
      lyrics: String(formData.get("lyrics") ?? "").trim() || null,
      cover_url: String(formData.get("cover_url") ?? "").trim() || null,
      r2_folder: String(formData.get("r2_folder") ?? "").trim() || null,
      category_id: String(formData.get("category_id") ?? "") || null,
      required_plan: String(formData.get("required_plan") ?? "") || null,
      published: formData.get("published") === "on",
    });

    revalidatePath("/admin/kits");
    revalidatePath(`/admin/kits/${id}/editar`);
    revalidatePath("/biblioteca");
    revalidatePath("/todos-os-kits");
    revalidatePath(`/biblioteca/${slug}`);
    redirect("/admin/kits");
  }

  return (
    <div className="space-y-6">
      <KitForm mode="edit" categories={categories} plans={plans} initialData={kit} action={updateKitAction} />
      <KitAudioSyncCard kitId={kit.id} />
    </div>
  );
}
