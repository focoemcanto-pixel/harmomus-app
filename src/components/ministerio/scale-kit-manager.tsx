"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronDown, Library, Loader2, Plus, Search } from "lucide-react";

type Kit = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  cover_url: string | null;
};

type ScaleKitManagerProps = {
  repertoireId: string;
};

export function ScaleKitManager({ repertoireId }: ScaleKitManagerProps) {
  const [query, setQuery] = useState("");
  const [kits, setKits] = useState<Kit[]>([]);
  const [existingKitIds, setExistingKitIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [loading, startLoading] = useTransition();
  const [addingKitId, setAddingKitId] = useState<string | null>(null);

  const endpoint = useMemo(() => `/api/ministerio/repertorios/${repertoireId}/kits`, [repertoireId]);

  function loadKits(nextQuery = query, nextShowAll = false) {
    const cleanQuery = nextQuery.trim();

    if (!cleanQuery && !nextShowAll) {
      setMessage("Digite o nome da música ou artista para buscar, ou clique em Mostrar todos.");
      setKits([]);
      setHasSearched(false);
      return;
    }

    startLoading(async () => {
      setMessage("");
      setHasSearched(true);
      setShowAll(nextShowAll);
      const params = new URLSearchParams();
      if (cleanQuery) params.set("q", cleanQuery);
      const response = await fetch(`${endpoint}/search?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error || "Não foi possível buscar os kits.");
        return;
      }

      setKits(payload.kits ?? []);
      setExistingKitIds(new Set((payload.existingKitIds ?? []).map(String)));
    });
  }

  async function addKit(kit: Kit) {
    setAddingKitId(kit.id);
    setMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitId: kit.id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error || "Não foi possível adicionar o kit.");
        return;
      }

      setExistingKitIds((current) => new Set([...current, kit.id]));
      setMessage(payload?.alreadyAdded ? "Esse kit já estava na escala." : `${kit.name} foi adicionado à escala.`);
    } finally {
      setAddingKitId(null);
    }
  }

  return (
    <div className="mt-6 rounded-[2rem] border border-white/10 bg-black/20 p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                loadKits(query, false);
              }
            }}
            maxLength={80}
            placeholder="Buscar música ou artista para adicionar à escala"
            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50"
          />
        </div>
        <button
          type="button"
          onClick={() => loadKits(query, false)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-70"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
        <button
          type="button"
          onClick={() => loadKits("", true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 disabled:opacity-70"
          disabled={loading}
        >
          <Library className="h-4 w-4" /> Mostrar todos
        </button>
      </div>

      <p className="mt-3 text-xs leading-5 text-zinc-500">
        Para manter a escala limpa, a biblioteca fica recolhida. Busque uma música específica ou use “Mostrar todos” quando quiser navegar pelo acervo.
      </p>

      {message ? <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm text-cyan-50">{message}</div> : null}

      {hasSearched ? (
        <details open className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-2 py-2 text-sm font-semibold text-zinc-100">
            <span>{showAll ? "Biblioteca Harmomus" : "Resultados da busca"} <span className="text-zinc-500">({kits.length})</span></span>
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          </summary>

          <div className="mt-2 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {kits.map((kit) => {
              const alreadyAdded = existingKitIds.has(kit.id);
              const isAdding = addingKitId === kit.id;

              return (
                <div key={kit.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
                      {kit.cover_url ? <img src={kit.cover_url} alt={kit.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[10px] text-zinc-500">HM</div>}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-white">{kit.name}</h3>
                      <p className="truncate text-xs text-zinc-400">{kit.artist || "Kit vocal"}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link href={`/biblioteca/${kit.slug}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10">
                      Ver kit
                    </Link>
                    {alreadyAdded ? (
                      <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                        <Check className="h-3.5 w-3.5" /> Adicionado
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addKit(kit)}
                        disabled={isAdding}
                        className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-70"
                      >
                        {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Adicionar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && !kits.length ? <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-zinc-400">Nenhum kit encontrado.</div> : null}
        </details>
      ) : null}
    </div>
  );
}
