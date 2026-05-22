import Link from "next/link";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getPublishedKits } from "@/lib/data/public-kits";

export default async function CategoriasPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [kits, params] = await Promise.all([getPublishedKits(), searchParams]);
  const term = typeof params?.q === "string" ? params.q.trim().toLowerCase() : "";
  const categories = Array.from(new Map(kits.filter((kit) => kit.category).map((kit) => [kit.category!.slug, kit.category!])).values());
  const filteredCategories = term ? categories.filter((category) => category.name.toLowerCase().includes(term)) : categories;
  const categoryKitCount = kits.reduce<Record<string, number>>((acc, kit) => {
    if (kit.category?.slug) acc[kit.category.slug] = (acc[kit.category.slug] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <PublicAppShell>
      <main className="mx-auto w-full max-w-[1320px] space-y-8 px-4 pb-16 pt-8 md:px-8">
        <section className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#101827] to-[#23123e] p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Catálogo</p>
          <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Artistas & Categorias</h1>
        </section>

        <section>
          <form className="mb-5">
            <input name="q" defaultValue={term} type="search" placeholder="Buscar categoria ou artista" className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-400" />
          </form>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCategories.map((category) => (
              <Link key={category.id} href={`/categoria/${category.slug}`} className="group overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#101827] to-[#23123e] shadow-[0_18px_48px_rgba(76,29,149,0.24)] transition hover:-translate-y-1">
                {category.cover_url ? <img src={category.cover_url} alt={category.name} className="h-40 w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-40 items-center justify-center bg-gradient-to-br from-fuchsia-900/60 via-indigo-900/60 to-cyan-900/60 px-4 text-center text-3xl font-bold text-white/90">{category.name}</div>}
                <div className="p-6">
                  <h3 className="text-2xl font-semibold text-white">{category.name}</h3>
                  <p className="mt-2 text-sm text-zinc-200">{categoryKitCount[category.slug] ?? 0} kits publicados</p>
                  <span className="mt-4 inline-flex text-sm text-cyan-100">Ver kits →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
