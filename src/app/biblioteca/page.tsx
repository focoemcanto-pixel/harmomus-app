import Link from "next/link";

import { getPublishedKits } from "@/lib/data/public-kits";

export default async function BibliotecaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const kits = await getPublishedKits();
  const q = String(params.q ?? "").toLowerCase();
  const category = String(params.category ?? "");
  const artist = String(params.artist ?? "");
  const plan = String(params.plan ?? "");

  const filtered = kits.filter((k) => {
    const matchesQ = !q || k.name.toLowerCase().includes(q) || k.artist.toLowerCase().includes(q);
    const matchesCategory = !category || k.category?.slug === category;
    const matchesArtist = !artist || k.artist === artist;
    const matchesPlan = !plan || k.requiredPlan?.slug === plan;
    return matchesQ && matchesCategory && matchesArtist && matchesPlan;
  });

  const categories = Array.from(new Map(kits.filter((k) => k.category).map((k) => [k.category!.slug, k.category!])).values());
  const artists = Array.from(new Set(kits.map((k) => k.artist))).sort();
  const plans = Array.from(new Map(kits.filter((k) => k.requiredPlan).map((k) => [k.requiredPlan!.slug, k.requiredPlan!])).values());

  return <main className="min-h-screen bg-background p-4 md:p-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 rounded-2xl border border-white/10 bg-surface/80 p-5"><h1 className="text-2xl text-white">Biblioteca Pública</h1></header>
      <form className="mb-6 grid gap-3 rounded-xl border border-white/10 bg-surface p-4 md:grid-cols-4">
        <input name="q" defaultValue={q} placeholder="Buscar por nome/artista" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" />
        <select name="category" defaultValue={category} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"><option value="">Categoria</option>{categories.map(c=><option key={c.id} value={c.slug}>{c.name}</option>)}</select>
        <select name="artist" defaultValue={artist} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"><option value="">Artista</option>{artists.map(a=><option key={a} value={a}>{a}</option>)}</select>
        <select name="plan" defaultValue={plan} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"><option value="">Plano</option>{plans.map(p=><option key={p.id} value={p.slug}>{p.name}</option>)}</select>
      </form>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((kit) => <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="rounded-xl border border-white/10 bg-surface p-3">
          <img src={kit.coverUrl ?? "https://placehold.co/600x360/101114/f4f4f5?text=Harmomus"} className="h-40 w-full rounded-lg object-cover" alt={kit.name} />
          <h3 className="mt-3 text-white">{kit.name}</h3><p className="text-sm text-zinc-300">{kit.artist}</p>
          {kit.requiredPlan ? <span className="mt-2 inline-flex rounded-full border border-gold-500/40 bg-gold-500/10 px-2 py-1 text-xs text-gold-300">Premium {kit.requiredPlan.name}</span> : null}
        </Link>)}
      </section>
    </div>
  </main>;
}
