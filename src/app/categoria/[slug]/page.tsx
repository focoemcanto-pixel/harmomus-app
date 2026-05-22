import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getPublishedKits } from "@/lib/data/public-kits";

export const revalidate = 300;

export default async function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kits = await getPublishedKits();
  const kitsByCategory = kits.filter((k) => k.category?.slug === slug);
  const category = kitsByCategory[0]?.category;

  if (!category) notFound();

  return (
    <PublicAppShell>
      <main className="mx-auto min-h-screen w-full max-w-7xl space-y-6 px-4 py-6 md:px-8">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#151b2d] to-[#0a101d] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Artista / Categoria</p>
          <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">{category.name}</h1>
          <p className="mt-2 max-w-3xl text-zinc-300">{category.description ?? "Todos os kits publicados desta categoria aparecem automaticamente aqui."}</p>
          <p className="mt-4 text-sm text-zinc-400">{kitsByCategory.length} kits publicados</p>
        </section>

        {kitsByCategory.length ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kitsByCategory.map((kit) => (
              <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0e1322]">
                {kit.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={kit.coverUrl} alt={kit.name} className="aspect-square w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-gradient-to-br from-zinc-900 to-[#141828] text-xs text-zinc-400">{category.name}</div>
                )}
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-white">{kit.name}</p>
                  <p className="truncate text-xs text-zinc-300">{kit.artist}</p>
                </div>
              </Link>
            ))}
          </section>
        ) : (
          <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-zinc-300">Nenhum kit nesta categoria ainda.</div>
        )}
      </main>
    </PublicAppShell>
  );
}
