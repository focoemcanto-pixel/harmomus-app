"use client";

interface KitOption {
  id: string;
  name: string;
  artist: string;
  slug: string;
}

export function PlaylistKitSearch({
  kits,
  query,
  onQueryChange,
  onAdd,
  selectedIds,
}: {
  kits: KitOption[];
  query: string;
  onQueryChange: (value: string) => void;
  onAdd: (kit: KitOption) => void;
  selectedIds: string[];
}) {
  const normalizedQuery = query.trim();
  const shouldShowResults = normalizedQuery.length >= 2;
  const visibleKits = shouldShowResults ? kits.slice(0, 8) : [];

  return (
    <div>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Buscar kits publicados"
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
      />

      {!shouldShowResults ? (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-400">
          Digite pelo menos 2 letras para buscar e adicionar novos kits à playlist.
        </p>
      ) : null}

      {shouldShowResults ? (
        <div className="mt-3 space-y-2">
          {visibleKits.length ? (
            visibleKits.map((kit) => {
              const alreadySelected = selectedIds.includes(kit.id);
              return (
                <button
                  key={kit.id}
                  type="button"
                  disabled={alreadySelected}
                  onClick={() => onAdd(kit)}
                  className="flex w-full items-center justify-between gap-4 rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-zinc-200 transition hover:border-cyan-200/60 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0 truncate">
                    {kit.name} • {kit.artist}
                  </span>
                  <span className="shrink-0 text-cyan-100">{alreadySelected ? "Adicionado" : "Adicionar"}</span>
                </button>
              );
            })
          ) : (
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-zinc-400">
              Nenhum kit encontrado com essa busca.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
