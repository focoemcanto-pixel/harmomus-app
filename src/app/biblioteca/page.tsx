import { LibraryContent } from "@/components/public/library-content";
import { PublicHeader } from "@/components/public/public-header";
import { getPublishedKits } from "@/lib/data/public-kits";

export default async function BibliotecaPage() {
  const kits = await getPublishedKits();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)]">
      <PublicHeader />
      <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold text-white md:text-4xl">Biblioteca Harmomus</h1>
          <p className="mt-2 text-sm text-zinc-300">Encontre kits publicados e abra instantaneamente.</p>
        </div>
        <LibraryContent kits={kits} />
      </section>
    </main>
  );
}
