import { PublicAppShell } from "@/components/public/public-app-shell";
import { notFound } from "next/navigation";

import { CategoryHero } from "@/components/public/category-hero";
import { getPublishedKits } from "@/lib/data/public-kits";

export default async function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kits = await getPublishedKits();
  const category = kits.find((k) => k.category?.slug === slug)?.category;
  if (!category) notFound();
  const kitsByCategory = kits.filter((k) => k.category?.slug === slug);

  return <PublicAppShell><main className="min-h-screen bg-background p-4 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <CategoryHero name={category.name} description={kitsByCategory[0]?.category?.description} coverUrl={kitsByCategory[0]?.category?.cover_url as any} totalKits={kitsByCategory.length} />
    {kitsByCategory.length ? <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{kitsByCategory.map((kit)=><a key={kit.id} href={`/biblioteca/${kit.slug}`} className="rounded-xl border border-white/10 bg-surface p-3 text-white">{kit.name}<p className="text-sm text-zinc-300">{kit.artist}</p></a>)}</section> : <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-zinc-300">Nenhum kit nesta categoria ainda.</div>}
  </div></main></PublicAppShell>;
}
