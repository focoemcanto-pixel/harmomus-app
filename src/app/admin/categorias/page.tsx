import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/admin/page-header";
import { setFlashToast } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

function buildSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function saveCategory(formData: FormData) {
  "use server";
  const supabase = (await createClient()) as any;
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();

  try {
    if (!name) throw new Error("Nome da categoria é obrigatório.");

    const payload = {
      name,
      slug: slugInput ? buildSlug(slugInput) : buildSlug(name),
      description: String(formData.get("description") ?? "").trim() || null,
      cover_url: String(formData.get("cover_url") ?? "").trim() || null,
    };

    if (id) {
      const { error } = await supabase.from("categories").update(payload).eq("id", id);
      if (error) throw new Error(`Falha ao atualizar categoria: ${error.message}`);
      await setFlashToast("success", `Categoria ${name} atualizada com sucesso.`);
    } else {
      const { error } = await supabase.from("categories").insert(payload);
      if (error) throw new Error(`Falha ao criar categoria: ${error.message}`);
      await setFlashToast("success", `Categoria ${name} criada com sucesso.`);
    }
  } catch (error) {
    await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível salvar a categoria.");
  }

  revalidatePath("/admin/categorias");
  revalidatePath("/biblioteca");
  revalidatePath("/todos-os-kits");
  revalidatePath("/");
}

export default async function CategoriasPage() {
  const supabase = (await createClient()) as any;
  const [{ data, error }, { data: kitsData }] = await Promise.all([
    supabase.from("categories").select("*").order("created_at", { ascending: false }),
    supabase.from("kits").select("category_id"),
  ]);

  if (error) throw new Error(`Falha ao carregar categorias: ${error.message}`);

  const categories = (data ?? []) as any[];
  const kitsByCategory = new Map<string, number>();
  for (const kit of kitsData ?? []) {
    const categoryId = kit?.category_id;
    if (!categoryId) continue;
    kitsByCategory.set(categoryId, (kitsByCategory.get(categoryId) ?? 0) + 1);
  }
  const categoriesWithCover = categories.filter((category) => category.cover_url).length;
  const emptyCategories = categories.filter((category) => !kitsByCategory.get(category.id)).length;

  return (
    <section className="space-y-6">
      <PageHeader title="Categorias" description="Organize artistas, coleções e páginas públicas da biblioteca Harmomus." />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Categorias</p>
          <p className="mt-2 text-3xl font-semibold text-white">{categories.length}</p>
          <p className="mt-1 text-sm text-muted">Total cadastrado</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Com capa</p>
          <p className="mt-2 text-3xl font-semibold text-white">{categoriesWithCover}</p>
          <p className="mt-1 text-sm text-muted">Prontas para destaque visual</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Sem kits</p>
          <p className="mt-2 text-3xl font-semibold text-white">{emptyCategories}</p>
          <p className="mt-1 text-sm text-muted">Categorias ainda vazias</p>
        </div>
      </div>

      <form action={saveCategory} className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
        <div className="flex flex-col gap-2 border-b border-border/70 pb-5">
          <p className="text-xs uppercase tracking-[0.22em] text-gold-300">Nova categoria</p>
          <h3 className="text-xl font-semibold tracking-tight text-white">Criar categoria</h3>
          <p className="text-sm text-muted">O slug é normalizado automaticamente. Deixe vazio para gerar a partir do nome.</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-muted">Nome
            <input name="name" placeholder="Ex.: Diante do Trono" required className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
          </label>
          <label className="text-sm text-muted">Slug
            <input name="slug" placeholder="diante-do-trono" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
          </label>
          <label className="text-sm text-muted md:col-span-2">Descrição
            <textarea name="description" placeholder="Descrição opcional para páginas públicas e organização interna." className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-3 text-white outline-none transition focus:border-gold-500/50" />
          </label>
          <label className="text-sm text-muted md:col-span-2">URL da capa
            <input name="cover_url" placeholder="https://..." className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
          </label>
        </div>

        <button className="mt-5 w-full rounded-2xl border border-gold-500/30 bg-gold-500/15 px-4 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25">Criar categoria</button>
      </form>

      {categories.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center shadow-premium">
          <p className="text-lg font-semibold text-white">Nenhuma categoria cadastrada</p>
          <p className="mt-2 text-sm text-muted">Crie categorias para organizar melhor os kits, artistas e coleções da biblioteca.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {categories.map((category) => {
            const linkedKits = kitsByCategory.get(category.id) ?? 0;
            return (
              <form key={category.id} action={saveCategory} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
                <input type="hidden" name="id" value={category.id} />

                <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                  <div className="relative min-h-44 bg-background sm:min-h-full">
                    <img
                      src={category.cover_url ?? "https://placehold.co/600x400/101114/f4f4f5?text=Sem+capa"}
                      alt={category.name}
                      className="h-full min-h-44 w-full object-cover"
                    />
                    <span className="absolute left-3 top-3 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100 backdrop-blur">
                      {linkedKits} kit{linkedKits === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="space-y-4 p-5 sm:p-6">
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight text-white">{category.name}</h3>
                      <p className="mt-1 text-sm text-muted">/{category.slug}</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="text-sm text-muted">Nome
                        <input name="name" defaultValue={category.name} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                      </label>
                      <label className="text-sm text-muted">Slug
                        <input name="slug" defaultValue={category.slug} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                      </label>
                    </div>

                    <label className="block text-sm text-muted">Descrição
                      <textarea name="description" defaultValue={category.description ?? ""} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background px-3 py-3 text-white outline-none transition focus:border-gold-500/50" />
                    </label>

                    <label className="block text-sm text-muted">URL da capa
                      <input name="cover_url" defaultValue={category.cover_url ?? ""} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                    </label>

                    <button className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:border-gold-500/30 hover:bg-gold-500/10 hover:text-gold-100">Salvar categoria</button>
                  </div>
                </div>
              </form>
            );
          })}
        </div>
      )}
    </section>
  );
}
