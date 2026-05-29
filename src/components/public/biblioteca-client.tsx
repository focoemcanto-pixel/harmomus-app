"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { canAccessKit, normalizePlan } from "@/lib/access/access-engine";

import type { PublicKit } from "@/lib/data/public-kits";

interface BibliotecaClientProps {
  kits: PublicKit[];
  planSlug: string;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getKitSearchText(kit: PublicKit) {
  return normalizeSearch([
    kit.name,
    kit.artist,
    kit.category?.name,
    kit.requiredPlan?.name,
    kit.tones.map((tone) => tone.tone).join(" "),
  ].filter(Boolean).join(" "));
}

function resolveLockedPlanLabel(kit: PublicKit) {
  const allowed = Array.isArray(kit.allowedPlanSlugs) ? kit.allowedPlanSlugs : [];
  if (kit.requiredPlan?.slug === "plus" || allowed.includes("plus")) return "PLUS";
  if (kit.requiredPlan?.slug === "premium" || allowed.includes("premium")) return "PREMIUM";
  return "PREMIUM";
}

export function BibliotecaClient({ kits, planSlug }: BibliotecaClientProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [artist, setArtist] = useState("");
  const [plan, setPlan] = useState("");
  const viewerPlan = normalizePlan(planSlug);

  const categories = useMemo(
    () => Array.from(new Map(kits.filter((kit) => kit.category).map((kit) => [kit.category!.slug, kit.category!])).values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [kits],
  );

  const artists = useMemo(
    () => Array.from(new Set(kits.map((kit) => kit.artist).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [kits],
  );

  const plans = useMemo(
    () => Array.from(new Map(kits.filter((kit) => kit.requiredPlan).map((kit) => [kit.requiredPlan!.slug, kit.requiredPlan!])).values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [kits],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return kits.filter((kit) => {
      const matchesQuery = !normalizedQuery || getKitSearchText(kit).includes(normalizedQuery);
      const matchesCategory = !category || kit.category?.slug === category;
      const matchesArtist = !artist || kit.artist === artist;
      const matchesPlan = !plan || kit.requiredPlan?.slug === plan;

      return matchesQuery && matchesCategory && matchesArtist && matchesPlan;
    });
  }, [kits, query, category, artist, plan]);

  function clearFilters() {
    setQuery("");
    setCategory("");
    setArtist("");
    setPlan("");
  }

  return (
    <>
      <section className="mb-6 rounded-xl border border-white/10 bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por música, artista, tom..."
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-gold-400/50"
          />

          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-gold-400/50"
          >
            <option value="">Todas as categorias</option>
            {categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
          </select>

          <select
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-gold-400/50"
          >
            <option value="">Todos os artistas</option>
            {artists.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>

          <select
            value={plan}
            onChange={(event) => setPlan(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-gold-400/50"
          >
            <option value="">Todos os planos</option>
            {plans.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
          <span>{filtered.length} de {kits.length} kit(s) encontrados</span>
          {(query || category || artist || plan) ? (
            <button type="button" onClick={clearFilters} className="rounded-full border border-white/10 px-3 py-1 text-zinc-200 hover:bg-white/10">
              Limpar filtros
            </button>
          ) : null}
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-surface p-6 text-center text-sm text-zinc-400">
          Nenhum kit encontrado com esses filtros.
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((kit) => {
            const locked = !canAccessKit(viewerPlan, kit.allowedPlanSlugs);
            const lockedPlan = resolveLockedPlanLabel(kit);
            const lockedText = lockedPlan === "PLUS" ? "Exclusivo Plus/Premium" : "Exclusivo Premium";

            return (
              <Link key={kit.id} href={`/biblioteca/${kit.slug}`} className="relative rounded-xl border border-white/10 bg-surface p-3 transition hover:-translate-y-0.5 hover:border-gold-400/30 hover:bg-white/[0.04]">
                <div className="relative overflow-hidden rounded-lg">
                  <img src={kit.coverUrl ?? "https://placehold.co/600x360/101114/f4f4f5?text=Harmomus"} className={`h-40 w-full object-cover transition ${locked ? "opacity-65" : ""}`} alt={kit.name} />
                  {locked ? (
                    <>
                      <div className="absolute inset-0 bg-black/30" />
                      <div className="absolute left-3 top-3 rounded-full border border-gold-300/50 bg-black/70 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-gold-100 shadow-lg">
                        🔒 {lockedPlan}
                      </div>
                      <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-white/15 bg-black/70 px-3 py-2 text-center backdrop-blur">
                        <p className="text-xs font-semibold text-white">{lockedText}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-300">Faça upgrade para desbloquear</p>
                      </div>
                    </>
                  ) : null}
                </div>
                <h3 className="mt-3 text-white">{kit.name}</h3>
                <p className="text-sm text-zinc-300">{kit.artist}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {kit.category ? <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-zinc-300">{kit.category.name}</span> : null}
                  {kit.requiredPlan ? <span className="rounded-full border border-gold-500/40 bg-gold-500/10 px-2 py-1 text-xs text-gold-300">{kit.requiredPlan.name}</span> : null}
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </>
  );
}
