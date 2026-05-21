import Link from "next/link";

import type { PublicKit } from "@/lib/data/public-kits";

interface KitCardProps {
  kit: PublicKit;
}

function getFileCount(kit: PublicKit) {
  return kit.tones.reduce((total, tone) => total + Object.keys(tone.voices).length, 0);
}

export function KitCard({ kit }: KitCardProps) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-surface/80 shadow-premium transition duration-300 hover:-translate-y-1 hover:border-gold-400/40">
      <img
        src={kit.coverUrl ?? "https://placehold.co/800x800/101114/f4f4f5?text=Harmomus"}
        alt={kit.name}
        className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.02]"
      />
      <div className="space-y-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-gold-300">{kit.category?.name ?? "Sem categoria"}</p>
          <h2 className="mt-1 line-clamp-1 text-xl font-semibold text-white">{kit.name}</h2>
          <p className="text-sm text-zinc-300">{kit.artist}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-gold-400/40 bg-gold-500/10 px-2.5 py-1 text-gold-300">
            Plano: {kit.requiredPlan?.name ?? "Livre"}
          </span>
          <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-zinc-300">{kit.tones.length} tons</span>
          <span className="rounded-full border border-white/15 bg-black/20 px-2.5 py-1 text-zinc-300">{getFileCount(kit)} arquivos</span>
        </div>

        <Link
          href={`/biblioteca/${kit.slug}`}
          className="inline-flex w-full items-center justify-center rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20"
        >
          Abrir kit
        </Link>
      </div>
    </article>
  );
}
