"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

interface AllKitsListItem {
  id: string;
  slug: string;
  name: string;
  artist: string;
  categoryName: string | null;
}

export function AllKitsList({ kits }: { kits: AllKitsListItem[] }) {
  const [query, setQuery] = useState("");

  const filteredKits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return kits;

    return kits.filter((kit) => {
      const name = kit.name.toLowerCase();
      const artist = kit.artist.toLowerCase();
      const category = (kit.categoryName ?? "").toLowerCase();
      return name.includes(q) || artist.includes(q) || category.includes(q);
    });
  }, [kits, query]);

  return (
    <section className="mx-auto w-full max-w-5xl rounded-3xl border border-white/10 bg-[#0d101a]/95 p-5 shadow-[0_25px_80px_rgba(0,0,0,0.5)] backdrop-blur-sm md:p-8">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Harmomus</p>
        <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">Todos os Kits Vocais</h1>
      </header>

      <div className="mt-6">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Buscar por nome, artista ou categoria"
          className="w-full rounded-xl border border-white/15 bg-[#080b14] px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-emerald-400/20"
        />
      </div>

      <div className="mt-6 text-sm text-zinc-300">{filteredKits.length} kits encontrados</div>

      <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {filteredKits.map((kit) => (
          <li key={kit.id}>
            <Link
              href={`/biblioteca/${kit.slug}`}
              className="group block rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition hover:border-cyan-300/40 hover:bg-white/[0.04]"
            >
              <p className="text-base font-semibold text-white transition group-hover:text-cyan-200">{kit.name}</p>
              <p className="mt-1 text-sm text-zinc-400">{kit.artist}{kit.categoryName ? ` • ${kit.categoryName}` : ""}</p>
            </Link>
          </li>
        ))}
      </ul>

      {filteredKits.length === 0 ? <p className="mt-6 text-sm text-zinc-400">Nenhum kit encontrado para sua busca.</p> : null}
    </section>
  );
}
