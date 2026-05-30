"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { PlaylistKitSearch } from "@/components/public/playlist-kit-search";
import { PlaylistSelectedList } from "@/components/public/playlist-selected-list";

interface KitOption {
  id: string;
  name: string;
  artist: string;
  slug: string;
}

export function CreatePlaylistForm({
  initialKits,
  initialSelectedKit,
}: {
  initialKits: KitOption[];
  initialSelectedKit?: KitOption | null;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<KitOption[]>(initialSelectedKit ? [initialSelectedKit] : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialKits;
    return initialKits.filter((kit) => `${kit.name} ${kit.artist}`.toLowerCase().includes(q));
  }, [initialKits, query]);

  const trimmedName = name.trim();
  const canCreate = trimmedName.length > 0 && selected.length > 0 && selected.length <= 20 && !loading;

  function addKit(kit: KitOption) {
    setError(null);
    setSelected((previous) => {
      if (previous.some((item) => item.id === kit.id)) return previous;
      if (previous.length >= 20) {
        setError("Máximo de 20 kits por playlist.");
        return previous;
      }
      return [...previous, kit];
    });
  }

  async function onCreate() {
    if (!trimmedName) {
      setError("Informe o nome da playlist.");
      return;
    }

    if (!selected.length) {
      setError("Selecione ao menos um kit.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          kitIds: selected.map((kit) => kit.id),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "Erro ao criar playlist.");
        return;
      }

      router.push(`/playlist/${data.slug}`);
    } catch {
      setError("Não foi possível criar a playlist agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1019] p-6 shadow-premium">
      <h1 className="text-3xl font-semibold text-white">Criar minha playlist</h1>
      <p className="mt-2 text-sm text-zinc-400">Monte uma lista com até 20 kits para estudar, ensaiar ou compartilhar.</p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}

      <label className="mt-5 block">
        <span className="text-sm font-medium text-zinc-200">Nome da playlist</span>
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          maxLength={80}
          placeholder="Ex.: Culto de domingo"
          className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50"
        />
      </label>

      <div className="mt-5">
        <PlaylistKitSearch
          kits={filtered}
          query={query}
          onQueryChange={setQuery}
          onAdd={addKit}
          selectedIds={selected.map((kit) => kit.id)}
        />
      </div>

      <div className="mt-5">
        <PlaylistSelectedList
          kits={selected}
          onRemove={(id) => {
            setSelected((previous) => previous.filter((kit) => kit.id !== id));
            setError(null);
          }}
        />
      </div>

      <button
        type="button"
        onClick={onCreate}
        disabled={!canCreate}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {loading ? "Criando..." : "Criar playlist"}
      </button>
    </section>
  );
}
