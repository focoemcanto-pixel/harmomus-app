import { AllKitsList } from "@/components/public/all-kits-list";
import { PublicHeader } from "@/components/public/public-header";
import { getPublishedKits } from "@/lib/data/public-kits";

export default async function TodosOsKitsPage() {
  const kits = await getPublishedKits();

  const sortedKits = kits
    .map((kit) => ({
      id: kit.id,
      slug: kit.slug,
      name: kit.name,
      artist: kit.artist,
      categoryName: kit.category?.name ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1b2440_0%,#070910_45%)]">
      <PublicHeader />
      <div className="px-4 py-8 md:px-8 md:py-12">
        <AllKitsList kits={sortedKits} />
      </div>
    </main>
  );
}
