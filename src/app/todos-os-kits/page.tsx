import { PublicAppShell } from "@/components/public/public-app-shell";
import { AllKitsList } from "@/components/public/all-kits-list";
import { getPublishedKits } from "@/lib/data/public-kits";
import { getCurrentSubscription } from "@/lib/access/current-subscription";

export default async function TodosOsKitsPage() {
  const [kits, subscription] = await Promise.all([getPublishedKits(), getCurrentSubscription()]);

  const sortedKits = kits
    .map((kit) => ({
      id: kit.id,
      slug: kit.slug,
      name: kit.name,
      artist: kit.artist?.trim() || "Harmomus",
      categoryName: kit.category?.name ?? null,
      requiredPlanSlug: kit.requiredPlan?.slug ?? null,
      allowedPlanSlugs: kit.allowedPlanSlugs ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1b2440_0%,#070910_45%)]">
        <div className="px-4 py-8 md:px-8 md:py-12">
          <AllKitsList kits={sortedKits} planSlug={subscription.planSlug} />
        </div>
      </main>
    </PublicAppShell>
  );
}
