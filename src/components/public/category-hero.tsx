import Link from "next/link";

export function CategoryHero({ name, description, coverUrl, totalKits }: { name: string; description?: string | null; coverUrl?: string | null; totalKits: number }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-surface/70 p-6 shadow-premium">
      <div className="grid items-center gap-4 md:grid-cols-[120px_1fr_auto]">
        <img src={coverUrl ?? "https://placehold.co/320x320/101114/f4f4f5?text=Categoria"} alt={name} className="h-28 w-28 rounded-xl border border-white/10 object-cover" />
        <div>
          <h1 className="text-2xl font-semibold text-white">{name}</h1>
          <p className="mt-2 text-sm text-zinc-300">{description ?? "Sem descrição."}</p>
          <p className="mt-2 text-xs uppercase tracking-wider text-gold-300">{totalKits} kits publicados</p>
        </div>
        <Link href="/biblioteca" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200">Voltar</Link>
      </div>
    </section>
  );
}
