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
    <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2 md:bottom-8 md:right-8">
      {error ? (
        <div className="max-w-xs rounded-2xl border border-rose-400/25 bg-rose-950/90 px-4 py-3 text-xs text-rose-100 shadow-2xl backdrop-blur">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-pressed={favorited}
        aria-label={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        className={`group inline-flex h-14 items-center gap-3 rounded-full border px-5 text-sm font-bold shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur transition hover:scale-[1.03] disabled:cursor-wait disabled:opacity-70 ${
          favorited
            ? "border-rose-300/40 bg-rose-500/95 text-white"
            : "border-white/15 bg-zinc-950/90 text-zinc-100 hover:border-rose-300/40 hover:bg-rose-500/20"
        }`}
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Heart className={`h-5 w-5 ${favorited ? "fill-current" : ""}`} />}
        <span>{favorited ? "Favoritado" : "Favoritar"}</span>
      </button>
    </div>
  );
}
