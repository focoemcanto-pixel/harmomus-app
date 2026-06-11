import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/admin/page-header";
import { setFlashToast } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12";
const labelClass = "text-xs font-medium text-muted sm:text-sm";

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
    <section className="space-y-4 sm:space-y-6">
      <PageHeader title="Categorias" description="Organize artistas, coleções e páginas públicas da biblioteca Harmomus." />

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
        <MetricCard label="Categorias" value={categories.length} helper="Total cadastrado" tone="gold" />
        <MetricCard label="Com capa" value={categoriesWithCover} helper="Prontas para destaque visual" tone="cyan" />
        <MetricCard label="Sem kits" value={emptyCategories} helper="Categorias ainda vazias" tone="amber" />
      </div>

      <form action={saveCategory} className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-6">
        <div className="flex flex-col gap-1.5 border-b border-border/70 pb-4 sm:pb-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-300 sm:text-xs sm:tracking-[0.22em]">Nova categoria</p>
          <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Criar categoria</h3>
          <p className="text-xs text-muted sm:text-sm">O slug é normalizado automaticamente. Deixe vazio para gerar a partir do nome.</p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 sm:mt-5 sm:gap-4">
          <label className={labelClass}>Nome
            <input name="name" placeholder="Ex.: Diante do Trono" required className={inputClass} />
          </label>
          <label className={labelClass}>Slug
            <input name="slug" placeholder="diante-do-trono" className={inputClass} />
          </label>
          <label className={`${labelClass} md:col-span-2`}>Descrição
            <textarea name="description" placeholder="Descrição opcional para páginas públicas e organização interna." className="mt-1.5 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:min-h-24" />
          </label>
          <label className={`${labelClass} md:col-span-2`}>URL da capa
            <input name="cover_url" placeholder="https://..." className={inputClass} />
          </label>
        </div>

        <button className="mt-4 w-full rounded-2xl border border-gold-500/30 bg-gold-500/15 px-4 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25 sm:mt-5">Criar categoria</button>
      </form>

      {categories.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center shadow-premium sm:p-10">
          <p className="text-lg font-semibold text-white">Nenhuma categoria cadastrada</p>
          <p className="mt-2 text-sm text-muted">Crie categorias para organizar melhor os kits, artistas e coleções da biblioteca.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {categories.map((category) => {
            const linkedKits = kitsByCategory.get(category.id) ?? 0;
            return (
              <form key={category.id} action={saveCategory} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
                <input type="hidden" name="id" value={category.id} />

                <div className="grid gap-0 sm:grid-cols-[150px_1fr]">
                  <div className="relative min-h-36 bg-background sm:min-h-full">
                    <img
                      src={category.cover_url ?? "https://placehold.co/600x400/101114/f4f4f5?text=Sem+capa"}
                      alt={category.name}
                      className="h-full min-h-36 w-full object-cover sm:min-h-full"
                    />
                    <span className="absolute left-3 top-3 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100 backdrop-blur sm:px-3 sm:text-[11px] sm:tracking-[0.14em]">
                      {linkedKits} kit{linkedKits === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                    <div>
                      <h3 className="line-clamp-1 text-lg font-semibold tracking-tight text-white sm:text-xl">{category.name}</h3>
                      <p className="mt-1 truncate text-xs text-muted sm:text-sm">/{category.slug}</p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={labelClass}>Nome
                        <input name="name" defaultValue={category.name} className={inputClass} />
                      </label>
                      <label className={labelClass}>Slug
                        <input name="slug" defaultValue={category.slug} className={inputClass} />
                      </label>
                    </div>

                    <label className={`block ${labelClass}`}>Descrição
                      <textarea name="description" defaultValue={category.description ?? ""} className="mt-1.5 min-h-20 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:min-h-24" />
                    </label>

                    <label className={`block ${labelClass}`}>URL da capa
                      <input name="cover_url" defaultValue={category.cover_url ?? ""} className={inputClass} />
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

function MetricCard({ label, value, helper, tone }: { label: string; value: number; helper: string; tone: "gold" | "cyan" | "amber" }) {
  const toneClass = tone === "gold" ? "text-gold-300" : tone === "cyan" ? "text-cyan-300" : "text-amber-300";
  return (
    <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
      <p className={`text-[11px] uppercase tracking-[0.18em] sm:text-xs ${toneClass}`}>{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted sm:text-sm">{helper}</p>
    </div>
  );
}
