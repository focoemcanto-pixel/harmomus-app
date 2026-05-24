"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

interface AllKitsListItem {
  id: string;
  slug: string;
  name: string;
  artist: string;
  categoryName: string | null;
}

const INITIAL_VISIBLE_COUNT = 36;
const LOAD_MORE_COUNT = 24;

export function AllKitsList({ kits }: { kits: AllKitsListItem[] }) {
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [query]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setVisibleCount((current) => Math.min(current + LOAD_MORE_COUNT, filteredKits.length));
      },
      { rootMargin: "420px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [filteredKits.length]);

  const visibleKits = filteredKits.slice(0, visibleCount);
  const hasMore = visibleCount < filteredKits.length;

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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-300">
        <span>{filteredKits.length} kits encontrados</span>
        {filteredKits.length > 0 ? <span className="text-xs text-zinc-500">Exibindo {visibleKits.length}</span> : null}
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {visibleKits.map((kit) => (
          <li key={kit.id}>
            <Link
              href={`/biblioteca/${kit.slug}`}
              prefetch
              className="group block rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition hover:border-cyan-300/40 hover:bg-white/[0.04]"
            >
              <p className="text-base font-semibold text-white transition group-hover:text-cyan-200">{kit.name}</p>
              <p className="mt-1 text-sm text-zinc-400">{kit.artist}{kit.categoryName ? ` • ${kit.categoryName}` : ""}</p>
            </Link>
          </li>
        ))}
      </ul>

      {filteredKits.length === 0 ? <p className="mt-6 text-sm text-zinc-400">Nenhum kit encontrado para sua busca.</p> : null}

      {hasMore ? (
        <div ref={loadMoreRef} className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setVisibleCount((current) => Math.min(current + LOAD_MORE_COUNT, filteredKits.length))}
            className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
          >
            Carregar mais kits
          </button>
        </div>
      ) : filteredKits.length > INITIAL_VISIBLE_COUNT ? (
        <p className="mt-6 text-center text-xs text-zinc-500">Todos os resultados foram carregados.</p>
      ) : null}
    </section>
  );
}
