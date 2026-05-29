"use client";

import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";

export function FavoriteKitButton({ kitId, initialFavorited = false }: { kitId: string; initialFavorited?: boolean }) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    setError(null);

    const response = await fetch("/api/favorites/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kitId }),
    });

    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Não foi possível atualizar favorito.");
      return;
    }

    setFavorited(Boolean(data.favorited));
  }

  return (
    <div className="relative inline-flex flex-col items-end gap-2">
      {error ? (
        <div className="absolute right-0 top-12 z-30 w-64 rounded-2xl border border-rose-400/25 bg-rose-950/95 px-4 py-3 text-xs text-rose-100 shadow-2xl backdrop-blur">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-pressed={favorited}
        aria-label={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
          favorited
            ? "border-rose-300/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
            : "border-white/15 bg-white/5 text-zinc-100 hover:border-rose-300/40 hover:bg-rose-500/10"
        }`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />}
        <span>{favorited ? "Favoritado" : "Favoritar"}</span>
      </button>
    </div>
  );
}
