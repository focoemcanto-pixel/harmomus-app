"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Library, Loader2, Music2, Plus, Search, X } from "lucide-react";

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
  const [libraryKits, setLibraryKits] = useState<Kit[]>([]);
  const [existingKitIds, setExistingKitIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [libraryLoading, startLibraryLoading] = useTransition();
  const [addingKitId, setAddingKitId] = useState<string | null>(null);

  const endpoint = useMemo(() => `/api/ministerio/repertorios/${repertoireId}/kits`, [repertoireId]);
  const cleanQuery = query.trim();

  function applySearchPayload(payload: { kits?: Kit[]; existingKitIds?: string[] }, target: "search" | "library") {
    const nextKits = payload.kits ?? [];
    if (target === "search") setKits(nextKits);
    if (target === "library") setLibraryKits(nextKits);
    setExistingKitIds(new Set((payload.existingKitIds ?? []).map(String)));
  }

  function loadKits(nextQuery = query, target: "search" | "library" = "search") {
    const normalizedQuery = nextQuery.trim();

    if (target === "search" && !normalizedQuery) {
      setKits([]);
      setHasSearched(false);
      return;
    }

    const transition = target === "library" ? startLibraryLoading : startLoading;

    transition(async () => {
      setMessage("");
      if (target === "search") setHasSearched(true);

      const params = new URLSearchParams();
      if (normalizedQuery) params.set("q", normalizedQuery);

      const response = await fetch(`${endpoint}/search?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error || "Não foi possível buscar os kits.");
        return;
      }

      applySearchPayload(payload, target);
    });
  }

  useEffect(() => {
    if (!modalOpen) return;
    if (cleanQuery.length < 2) {
      setKits([]);
      setHasSearched(false);
      return;
    }

    const timeout = window.setTimeout(() => loadKits(cleanQuery, "search"), 260);
    return () => window.clearTimeout(timeout);
  }, [cleanQuery, endpoint, modalOpen]);

  function openLibrary() {
    setDrawerOpen(true);
    if (!libraryKits.length) loadKits("", "library");
  }

  function closeModal() {
    setModalOpen(false);
    setDrawerOpen(false);
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

  function KitRow({ kit, compact = false }: { kit: Kit; compact?: boolean }) {
    const alreadyAdded = existingKitIds.has(kit.id);
    const isAdding = addingKitId === kit.id;

    return (
      <div className={`flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] ${compact ? "p-2" : "p-3"}`}>
        <button type="button" onClick={() => addKit(kit)} disabled={alreadyAdded || isAdding} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
          <div className={`${compact ? "h-9 w-9" : "h-12 w-12"} shrink-0 overflow-hidden rounded-xl bg-white/5`}>
            {kit.cover_url ? <img src={kit.cover_url} alt={kit.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[10px] text-zinc-500">HM</div>}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-white">{kit.name}</h3>
            <p className="truncate text-xs text-zinc-400">{kit.artist || "Kit vocal"}</p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {!compact ? (
            <Link href={`/biblioteca/${kit.slug}`} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10">
              Ver kit
            </Link>
          ) : null}
          {alreadyAdded ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100">
              <Check className="h-3.5 w-3.5" /> Adicionado
            </span>
          ) : (
            <button type="button" onClick={() => addKit(kit)} disabled={isAdding} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-70">
              {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Adicionar
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <button type="button" onClick={() => setModalOpen(true)} className="grid w-full gap-4 rounded-[2rem] border border-cyan-300/20 bg-cyan-400/10 p-5 text-left transition hover:border-cyan-300/40 hover:bg-cyan-400/15 md:grid-cols-[1fr_auto] md:items-center">
        <span className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
            <Music2 className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Montagem</span>
            <span className="mt-1 block text-xl font-semibold text-white">Montar repertório</span>
            <span className="mt-1 block text-sm leading-6 text-zinc-400">Adicione músicas e explore a biblioteca sem ocupar a tela principal da escala.</span>
          </span>
        </span>
        <span className="inline-flex w-fit items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950">
          <Plus className="h-4 w-4" /> Abrir montagem
        </span>
      </button>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4 backdrop-blur-sm md:p-8">
          <div className="mx-auto flex min-h-full w-full max-w-5xl items-center">
            <div className="relative w-full rounded-[2rem] border border-white/10 bg-[#090d18] p-5 shadow-2xl shadow-black/60 md:p-7">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Montar repertório</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Adicionar músicas à escala</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">Busque uma música específica ou abra a biblioteca completa. Ao terminar, feche esta janela para voltar à escala limpa.</p>
                </div>
                <button type="button" onClick={closeModal} className="absolute right-4 top-4 rounded-2xl border border-white/10 p-3 text-zinc-300 transition hover:bg-white/10 md:static">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative md:max-w-xl md:flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        loadKits(query, "search");
                      }
                    }}
                    maxLength={80}
                    placeholder="Buscar música..."
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50"
                  />

                  {hasSearched ? (
                    <div className="absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-3xl border border-white/10 bg-[#090d18] p-2 shadow-2xl shadow-black/40">
                      {loading ? <div className="flex items-center gap-2 p-4 text-sm text-zinc-300"><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</div> : null}
                      {!loading && kits.map((kit) => <KitRow key={kit.id} kit={kit} compact />)}
                      {!loading && !kits.length ? <div className="p-4 text-sm text-zinc-400">Nenhuma música encontrada.</div> : null}
                    </div>
                  ) : null}
                </div>

                <button type="button" onClick={openLibrary} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">
                  <Library className="h-4 w-4" /> Explorar biblioteca
                </button>
              </div>

              {message ? <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm text-cyan-50">{message}</div> : null}

              <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5 text-sm leading-6 text-zinc-400">
                Dica: depois de adicionar as músicas, use os botões de configuração da lista para definir tom e nipe por música.
              </div>

              {drawerOpen ? (
                <div className="fixed inset-0 z-[60]">
                  <button type="button" aria-label="Fechar biblioteca" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                  <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#090d18] p-5 shadow-2xl shadow-black/50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Biblioteca Harmomus</p>
                        <h3 className="mt-2 text-2xl font-semibold text-white">Explorar biblioteca</h3>
                        <p className="mt-1 text-sm text-zinc-400">Navegue pelo acervo sem poluir a tela principal da escala.</p>
                      </div>
                      <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-2xl border border-white/10 p-3 text-zinc-300 transition hover:bg-white/10">
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="mt-5 flex-1 overflow-y-auto pr-1">
                      {libraryLoading ? <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-zinc-300"><Loader2 className="h-4 w-4 animate-spin" /> Carregando biblioteca...</div> : null}
                      <div className="space-y-2">
                        {libraryKits.map((kit) => <KitRow key={kit.id} kit={kit} />)}
                      </div>
                      {!libraryLoading && !libraryKits.length ? <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Nenhum kit encontrado na biblioteca.</div> : null}
                    </div>
                  </aside>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
