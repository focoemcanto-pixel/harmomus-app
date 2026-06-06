"use client";

import { useMemo, useState } from "react";

import { KitCard } from "@/components/public/kit-card";
import { LibraryFilters } from "@/components/public/library-filters";
import type { PublicKit } from "@/lib/data/public-kits";

interface LibraryContentProps {
  kits: PublicKit[];
}

function resolveKitArtist(kit: Pick<PublicKit, "artist">) {
  return kit.artist?.trim() || "Harmomus";
}

export function LibraryContent({ kits }: LibraryContentProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [plan, setPlan] = useState("all");

  const categories = useMemo(() => Array.from(new Set(kits.map((kit) => kit.category?.name).filter(Boolean))) as string[], [kits]);
  const plans = useMemo(() => Array.from(new Set(kits.map((kit) => kit.requiredPlan?.name ?? "Livre"))), [kits]);

  const filteredKits = useMemo(() => {
    const normalizedSearch = search.toLowerCase().trim();

    return kits.filter((kit) => {
      const matchesSearch =
        !normalizedSearch ||
        kit.name.toLowerCase().includes(normalizedSearch) ||
        resolveKitArtist(kit).toLowerCase().includes(normalizedSearch);
      const matchesCategory = category === "all" || (kit.category?.name ?? "Sem categoria") === category;
      const matchesPlan = plan === "all" || (kit.requiredPlan?.name ?? "Livre") === plan;

      return matchesSearch && matchesCategory && matchesPlan;
    });
  }, [kits, search, category, plan]);

  return (
    <>
      <LibraryFilters
        search={search}
        category={category}
        plan={plan}
        categories={categories}
        plans={plans}
        onSearchChange={setSearch}
        onCategoryChange={setCategory}
        onPlanChange={setPlan}
      />

      {filteredKits.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-surface/70 p-10 text-center shadow-premium">
          <p className="text-lg font-medium text-white">Nenhum kit encontrado</p>
          <p className="mt-2 text-sm text-zinc-400">Ajuste os filtros ou volte mais tarde para novas publicações.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredKits.map((kit) => (
            <KitCard key={kit.id} kit={kit} />
          ))}
        </div>
      )}
    </>
  );
}
