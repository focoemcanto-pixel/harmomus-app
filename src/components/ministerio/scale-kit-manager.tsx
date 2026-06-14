"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Library, Loader2, Music2, Plus, Search, Settings, X } from "lucide-react";

type Kit = {
  id: string;
  slug: string;
  name: string;
  artist: string | null;
  cover_url: string | null;
};

type SelectedScaleSong = {
  id: string;
  kitId: string;
  position: number;
  name: string;
  artist: string | null;
};

type ScaleKitManagerProps = {
  repertoireId: string;
  selectedSongs?: SelectedScaleSong[];
};

export function ScaleKitManager({ repertoireId, selectedSongs = [] }: ScaleKitManagerProps) {
  const router = useRouter();
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [kits, setKits] = useState<Kit[]>([]);
  const [libraryKits, setLibraryKits] = useState<Kit[]>([]);
  const [scaleSongs, setScaleSongs] = useState<SelectedScaleSong[]>(selectedSongs);
  const [existingKitIds, setExistingKitIds] = useState<Set<string>>(new Set(selectedSongs.map((song) => song.kitId)));
  const [message, setMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [addingKitId, setAddingKitId] = useState<string | null>(null);

  const endpoint = useMemo(() => `/api/ministerio/repertorios/${repertoireId}/kits`, [repertoireId]);
  const cleanQuery = query.trim();
  const selectedCount = scaleSongs.length;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setScaleSongs(selectedSongs);
    setExistingKitIds(new Set(selectedSongs.map((song) => song.kitId)));
  }, [selectedSongs]);

  useEffect(() => {
    if (!modalOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen || !searchOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!searchBoxRef.current?.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [modalOpen, searchOpen]);

  function applySearchPayload(payload: { kits?: Kit[]; existingKitIds?: string[] }, target: "search" | "library") {
    const nextKits = payload.kits ?? [];
    if (target === "search") setKits(nextKits);
    if (target === "library") setLibraryKits(nextKits);
    setExistingKitIds((current) => new Set([...current, ...(payload.existingKitIds ?? []).map(String)]));
  }

  async function loadKits(nextQuery = query, target: "search" | "library" = "search") {
    const normalizedQuery = nextQuery.trim();

    if (target === "search" && !normalizedQuery) {
      setKits([]);
      setHasSearched(false);
      setSearchOpen(false);
      return;
    }

    setMessage("");
    if (target === "search") {
      setHasSearched(true);
      setSearchOpen(true);
      setLoading(true);
    } else {
      setLibraryLoading(true);
    }

    try {
      const params = new URLSearchParams();
      if (normalizedQuery) params.set("q", normalizedQuery);

      const response = await fetch(`${endpoint}/search?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error || "Não foi possível buscar os kits.");
        return;
      }

      applySearchPayload(payload, target);
    } finally {
      if (target === "search") setLoading(false);
      else setLibraryLoading(false);
    }
  }

  useEffect(() => {
    if (!modalOpen) return;
    if (cleanQuery.length < 2) {
      setKits([]);
      setHasSearched(false);
      setSearchOpen(false);
      return;
    }

    const timeout = window.setTimeout(() => void loadKits(cleanQuery, "search"), 70);
    return () => window.clearTimeout(timeout);
  }, [cleanQuery, endpoint, modalOpen]);

  function openLibrary() {
    setDrawerOpen(true);
    if (!libraryKits.length) void loadKits("", "library");
  }

  function closeModal() {
    setModalOpen(false);
    setDrawerOpen(false);
    setSearchOpen(false);
  }

  async function addKit(kit: Kit) {
    if (existingKitIds.has(kit.id) || scaleSongs.some((song) => song.kitId === kit.id)) return;

    const optimisticId = `optimistic-${kit.id}`;
    const optimisticSong: SelectedScaleSong = {
      id: optimisticId,
      kitId: kit.id,
      position: scaleSongs.length + 1,
      name: kit.name,
      artist: kit.artist,
    };

    setAddingKitId(kit.id);
    setMessage(`${kit.name} foi adicionado à escala.`);
    setExistingKitIds((current) => new Set([...current, kit.id]));
    setScaleSongs((current) => {
      if (current.some((song) => song.kitId === kit.id)) return current;
      return [...current, { ...optimisticSong, position: current.length + 1 }];
    });
    setSearchOpen(false);
    setHasSearched(false);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitId: kit.id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setExistingKitIds((current) => {
          const next = new Set(current);
          next.delete(kit.id);
          return next;
        });
        setScaleSongs((current) => current.filter((song) => song.kitId !== kit.id && song.id !== optimisticId).map((song, index) => ({ ...song, position: index + 1 })));
        setMessage(payload?.error || "Não foi possível adicionar o kit.");
        return;
      }

      if (payload?.item?.id) {
        setScaleSongs((current) => current.map((song) => {
          if (song.kitId !== kit.id && song.id !== optimisticId) return song;
          return {
            id: String(payload.item.id),
            kitId: kit.id,
            position: Number(payload.item.position ?? song.position),
            name: String(payload?.kit?.name ?? kit.name),
            artist: payload?.kit?.artist ?? kit.artist ?? null,
          };
        }).sort((a, b) => a.position - b.position));
      }

      setMessage(payload?.alreadyAdded ? "Esse kit já estava na escala." : `${kit.name} foi adicionado à escala.`);
      window.setTimeout(() => router.refresh(), 450);
    } finally {
      setAddingKitId(null);
    }
  }

  function KitRow({ kit, compact = false }: { kit: Kit; compact?: boolean }) {
    const alreadyAdded = existingKitIds.has(kit.id) || scaleSongs.some((song) => song.kitId === kit.id);
    const isAdding = addingKitId === kit.id;

    return (
      <div className={`flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] transition ${compact ? "p-2" : "p-3"} ${alreadyAdded ? "border-emerald-300/20 bg-emerald-400/10" : ""}`}>
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
          {!compact ? <Link href={`/biblioteca/${kit.slug}`} prefetch className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:bg-white/10">Ver kit</Link> : null}
          {alreadyAdded ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100"><Check className="h-3.5 w-3.5" /> Adicionado</span>
          ) : (
            <button type="button" onClick={() => addKit(kit)} disabled={isAdding} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:opacity-70">
              {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Adicionar
            </button>
          )}
        </div>
      </div>
    );
  }

  const modal = (
    <div className="fixed inset-0 z-[2147483647] isolate h-dvh w-dvw overflow-hidden bg-black/85 text-white backdrop-blur-md">
      <button type="button" aria-label="Fechar montagem" onClick={closeModal} className="absolute inset-0 cursor-default" />
      <div className="relative z-10 flex h-full w-full items-stretch justify-center p-3 md:p-8">
        <section className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#090d18] shadow-2xl shadow-black/60" onClick={(event) => event.stopPropagation()}>
          <header className="shrink-0 border-b border-white/10 p-5 md:p-7">
            <div className="flex flex-col gap-4 pr-14 md:flex-row md:items-start md:justify-between md:pr-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Montar repertório</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">Adicionar e organizar músicas</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">A montagem assume a tela inteira: busca, músicas selecionadas e biblioteca ficam isoladas da página da escala.</p>
              </div>
              <button type="button" onClick={closeModal} className="absolute right-4 top-4 rounded-2xl border border-white/10 p-3 text-zinc-300 transition hover:bg-white/10 md:static"><X className="h-5 w-5" /></button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-7">
            <div className="sticky top-0 z-20 -mx-5 -mt-5 border-b border-white/10 bg-[#090d18]/95 p-5 backdrop-blur md:-mx-7 md:-mt-7 md:p-7">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div ref={searchBoxRef} className="relative md:max-w-2xl md:flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input value={query} onFocus={() => { if (kits.length || hasSearched) setSearchOpen(true); }} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void loadKits(query, "search"); } if (event.key === "Escape") setSearchOpen(false); }} maxLength={80} placeholder="Buscar música..." className="w-full rounded-2xl border border-cyan-300/35 bg-white/[0.06] py-3 pl-11 pr-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/70" />
                  {hasSearched && searchOpen ? (
                    <div className="absolute z-40 mt-2 max-h-[50dvh] w-full overflow-y-auto rounded-3xl border border-white/10 bg-[#090d18] p-2 shadow-2xl shadow-black/60">
                      {loading ? <div className="flex items-center gap-2 p-4 text-sm text-zinc-300"><Loader2 className="h-4 w-4 animate-spin" /> Buscando...</div> : null}
                      {!loading && kits.map((kit) => <KitRow key={kit.id} kit={kit} compact />)}
                      {!loading && !kits.length ? <div className="p-4 text-sm text-zinc-400">Nenhuma música encontrada.</div> : null}
                    </div>
                  ) : null}
                </div>
                <button type="button" onClick={openLibrary} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10 active:scale-[0.99]"><Library className="h-4 w-4" /> Explorar biblioteca</button>
              </div>
              {message ? <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm text-cyan-50">{message}</div> : null}
            </div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Repertório selecionado</p>
                  <h4 className="mt-1 text-lg font-semibold text-white">{selectedCount} música{selectedCount === 1 ? "" : "s"} na escala</h4>
                </div>
                <p className="text-xs text-zinc-500">Configuração de tom e nipes continua por música.</p>
              </div>
              {scaleSongs.length ? (
                <div className="mt-4 space-y-2">
                  {scaleSongs.map((song) => <div key={song.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3 transition md:flex-row md:items-center md:justify-between"><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Música {song.position}</p><h5 className="truncate text-sm font-semibold text-white">{song.name}</h5><p className="truncate text-xs text-zinc-400">{song.artist || "Kit vocal"}</p></div>{song.id.startsWith("optimistic-") ? <span className="inline-flex w-fit items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando</span> : <Link prefetch href={`/ministerio/repertorios/${repertoireId}/musicas/${song.id}`} className="inline-flex w-fit items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20"><Settings className="h-3.5 w-3.5" /> Configurar</Link>}</div>)}
                </div>
              ) : <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-zinc-400">Nenhuma música adicionada ainda.</div>}
            </div>
          </div>

          {drawerOpen ? <div className="fixed inset-0 z-[2147483647]"><button type="button" aria-label="Fechar biblioteca" onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm" /><aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#090d18] p-5 shadow-2xl shadow-black/50"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Biblioteca Harmomus</p><h3 className="mt-2 text-2xl font-semibold text-white">Explorar biblioteca</h3><p className="mt-1 text-sm text-zinc-400">Navegue pelo acervo sem poluir a tela principal da escala.</p></div><button type="button" onClick={() => setDrawerOpen(false)} className="rounded-2xl border border-white/10 p-3 text-zinc-300 transition hover:bg-white/10"><X className="h-5 w-5" /></button></div><div className="mt-5 flex-1 overflow-y-auto pr-1">{libraryLoading ? <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-zinc-300"><Loader2 className="h-4 w-4 animate-spin" /> Carregando biblioteca...</div> : null}<div className="space-y-2">{libraryKits.map((kit) => <KitRow key={kit.id} kit={kit} />)}</div>{!libraryLoading && !libraryKits.length ? <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Nenhum kit encontrado na biblioteca.</div> : null}</div></aside></div> : null}
        </section>
      </div>
    </div>
  );

  return (
    <div className="mt-5">
      <button type="button" onClick={() => setModalOpen(true)} className="grid w-full gap-4 rounded-[2rem] border border-cyan-300/20 bg-cyan-400/10 p-5 text-left transition hover:border-cyan-300/40 hover:bg-cyan-400/15 active:scale-[0.995] md:grid-cols-[1fr_auto] md:items-center">
        <span className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100"><Music2 className="h-5 w-5" /></span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Montagem</span>
            <span className="mt-1 block text-xl font-semibold text-white">Montar repertório</span>
            <span className="mt-1 block text-sm leading-6 text-zinc-400">{selectedCount ? `${selectedCount} música${selectedCount === 1 ? "" : "s"} selecionada${selectedCount === 1 ? "" : "s"}. Abra para ver, adicionar e configurar.` : "Adicione músicas e explore a biblioteca sem ocupar a tela principal da escala."}</span>
          </span>
        </span>
        <span className="inline-flex w-fit items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950"><Plus className="h-4 w-4" /> Abrir montagem</span>
      </button>

      {modalOpen && mounted ? createPortal(modal, document.body) : null}
    </div>
  );
}
