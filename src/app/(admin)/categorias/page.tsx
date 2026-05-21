import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/admin/page-header";
import { createClient } from "@/lib/supabase/server";

async function saveCategory(formData: FormData) {
  "use server";
  const supabase = (await createClient()) as any;
  const id = String(formData.get("id") ?? "").trim();
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    cover_url: String(formData.get("cover_url") ?? "").trim() || null,
  };
  if (id) await supabase.from("categories").update(payload).eq("id", id);
  else await supabase.from("categories").insert(payload);
  revalidatePath("/categorias");
}

export default async function CategoriasPage() {
  const supabase = (await createClient()) as any;
  const { data } = await supabase.from("categories").select("*").order("created_at", { ascending: false });
  const categories = (data ?? []) as any[];

  return (
    <section className="space-y-6">
      <PageHeader title="Categorias" description="Gerencie categorias públicas para biblioteca e páginas automáticas." />
      <form action={saveCategory} className="grid gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-2">
        <input name="name" placeholder="Nome" required className="rounded border border-border bg-surface-muted px-3 py-2" />
        <input name="slug" placeholder="slug" required className="rounded border border-border bg-surface-muted px-3 py-2" />
        <textarea name="description" placeholder="Descrição" className="rounded border border-border bg-surface-muted px-3 py-2 md:col-span-2" />
        <input name="cover_url" placeholder="URL da capa" className="rounded border border-border bg-surface-muted px-3 py-2 md:col-span-2" />
        <button className="rounded border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-gold-300 md:col-span-2">Criar categoria</button>
      </form>
      <div className="space-y-3">
        {categories.map((c) => <form key={c.id} action={saveCategory} className="grid gap-2 rounded-xl border border-border bg-surface p-3 md:grid-cols-2">
          <input type="hidden" name="id" value={c.id} />
          <input name="name" defaultValue={c.name} className="rounded border border-border bg-surface-muted px-3 py-2" />
          <input name="slug" defaultValue={c.slug} className="rounded border border-border bg-surface-muted px-3 py-2" />
          <textarea name="description" defaultValue={c.description ?? ""} className="rounded border border-border bg-surface-muted px-3 py-2 md:col-span-2" />
          <input name="cover_url" defaultValue={(c as any).cover_url ?? ""} className="rounded border border-border bg-surface-muted px-3 py-2 md:col-span-2" />
          <button className="rounded border border-white/15 px-4 py-2 text-zinc-200 md:col-span-2">Salvar</button>
        </form>)}
      </div>
    </section>
  );
}
