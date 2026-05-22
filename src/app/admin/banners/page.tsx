import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/admin/page-header";
import { deleteHomeBanner, getAdminHomeBanners, updateHomeBanner } from "@/lib/data/home-banners";

export default async function AdminBannersPage() {
  const banners = await getAdminHomeBanners();

  async function saveBanner(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const payload = {
      title: String(formData.get("title") ?? ""), subtitle: String(formData.get("subtitle") ?? ""), image_url: String(formData.get("image_url") ?? ""),
      mobile_image_url: String(formData.get("mobile_image_url") ?? "") || null, button_label: String(formData.get("button_label") ?? ""), button_href: String(formData.get("button_href") ?? ""),
      type: String(formData.get("type") ?? "campanha"), is_active: formData.get("is_active") === "on", sort_order: Number(formData.get("sort_order") ?? 0),
      starts_at: String(formData.get("starts_at") ?? "") || null, ends_at: String(formData.get("ends_at") ?? "") || null,
    };
    if (!id) {
      const { createHomeBanner } = await import("@/lib/data/home-banners");
      await createHomeBanner(payload);
    } else await updateHomeBanner(id, payload);
    revalidatePath("/"); revalidatePath("/admin/banners");
  }

  async function removeBanner(formData: FormData) {
    "use server";
    await deleteHomeBanner(String(formData.get("id") ?? ""));
    revalidatePath("/"); revalidatePath("/admin/banners");
  }

  return <section className="space-y-6"><PageHeader title="Banners da Home" description="Gerencie o carrossel premium da primeira dobra." />
    <div className="rounded-xl border border-border bg-surface p-4"><h3 className="mb-3 font-semibold">Novo banner</h3><BannerForm action={saveBanner} /></div>
    <div className="space-y-4">{banners.map((b)=><div key={b.id} className="rounded-xl border border-border bg-surface p-4"><BannerForm action={saveBanner} banner={b} /><form action={removeBanner} className="mt-3"><input type="hidden" name="id" value={b.id} /><button className="text-xs text-red-300">Excluir</button></form></div>)}</div></section>;
}

function BannerForm({ action, banner }: { action: (data: FormData) => Promise<void>; banner?: any }) {
  return <form action={action} className="grid gap-2 md:grid-cols-2 text-sm"><input type="hidden" name="id" defaultValue={banner?.id ?? ""} />
    <input name="title" defaultValue={banner?.title ?? ""} placeholder="Título" className="rounded border border-border bg-background px-3 py-2" />
    <input name="subtitle" defaultValue={banner?.subtitle ?? ""} placeholder="Subtítulo" className="rounded border border-border bg-background px-3 py-2" />
    <input name="image_url" defaultValue={banner?.image_url ?? ""} placeholder="Imagem desktop URL" className="rounded border border-border bg-background px-3 py-2" required />
    <input name="mobile_image_url" defaultValue={banner?.mobile_image_url ?? ""} placeholder="Imagem mobile URL" className="rounded border border-border bg-background px-3 py-2" />
    <input name="button_label" defaultValue={banner?.button_label ?? ""} placeholder="Texto botão" className="rounded border border-border bg-background px-3 py-2" />
    <input name="button_href" defaultValue={banner?.button_href ?? ""} placeholder="Link botão" className="rounded border border-border bg-background px-3 py-2" />
    <select name="type" defaultValue={banner?.type ?? "campanha"} className="rounded border border-border bg-background px-3 py-2"><option>kit</option><option>lançamento</option><option>curso</option><option>anúncio</option><option>campanha</option></select>
    <input name="sort_order" type="number" defaultValue={banner?.sort_order ?? 0} className="rounded border border-border bg-background px-3 py-2" />
    <input name="starts_at" type="datetime-local" defaultValue={banner?.starts_at?.slice(0, 16) ?? ""} className="rounded border border-border bg-background px-3 py-2" />
    <input name="ends_at" type="datetime-local" defaultValue={banner?.ends_at?.slice(0, 16) ?? ""} className="rounded border border-border bg-background px-3 py-2" />
    <label className="flex items-center gap-2"><input name="is_active" type="checkbox" defaultChecked={banner?.is_active ?? true} />Ativo</label>
    <button className="rounded bg-gold-500/20 px-3 py-2 text-gold-200">Salvar</button>
  </form>;
}
