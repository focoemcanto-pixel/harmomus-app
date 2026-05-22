import { revalidatePath } from "next/cache";

import { HomeSectionForm } from "@/components/admin/home-section-form";
import { PageHeader } from "@/components/admin/page-header";
import { createHomeSection, deleteHomeSection, getAdminHomeSections, updateHomeSection } from "@/lib/data/home-sections";

export default async function AdminHomeSectionsPage() {
  const sections = await getAdminHomeSections();

  async function saveSection(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const payload = {
      type: String(formData.get("type") ?? "course_highlight"),
      title: String(formData.get("title") ?? ""),
      subtitle: String(formData.get("subtitle") ?? ""),
      image_url: String(formData.get("image_url") ?? ""),
      button_text: String(formData.get("button_text") ?? ""),
      button_link: String(formData.get("button_link") ?? ""),
      active: formData.get("active") === "on",
      order_index: Number(formData.get("order_index") ?? 0),
    };

    if (!id) await createHomeSection(payload);
    else await updateHomeSection(id, payload);

    revalidatePath("/");
    revalidatePath("/admin/home-sections");
  }

  async function removeSection(formData: FormData) {
    "use server";
    await deleteHomeSection(String(formData.get("id") ?? ""));
    revalidatePath("/");
    revalidatePath("/admin/home-sections");
  }

  return <section className="space-y-6"><PageHeader title="Blocos promocionais" description="Gerencie os blocos promocionais da home." />
    <div className="rounded-xl border border-border bg-surface p-4"><h3 className="mb-3 font-semibold">Novo bloco</h3><HomeSectionForm action={saveSection} /></div>
    <div className="space-y-4">{sections.map((section)=><div key={section.id} className="rounded-xl border border-border bg-surface p-4"><HomeSectionForm action={saveSection} section={section} /><form action={removeSection} className="mt-3"><input type="hidden" name="id" value={section.id} /><button className="text-xs text-red-300">Excluir</button></form></div>)}</div>
  </section>;
}
