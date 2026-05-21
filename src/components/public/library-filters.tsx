"use client";

interface LibraryFiltersProps {
  search: string;
  category: string;
  plan: string;
  categories: string[];
  plans: string[];
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onPlanChange: (value: string) => void;
}

export function LibraryFilters({
  search,
  category,
  plan,
  categories,
  plans,
  onSearchChange,
  onCategoryChange,
  onPlanChange,
}: LibraryFiltersProps) {
  return (
    <section className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-surface/70 p-4 md:grid-cols-3">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Buscar por nome ou artista"
        className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-gold-400/50"
      />
      <select
        value={category}
        onChange={(event) => onCategoryChange(event.target.value)}
        className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-gold-400/50"
      >
        <option value="all">Todas categorias</option>
        {categories.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <select
        value={plan}
        onChange={(event) => onPlanChange(event.target.value)}
        className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-gold-400/50"
      >
        <option value="all">Todos planos</option>
        {plans.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </section>
  );
}
