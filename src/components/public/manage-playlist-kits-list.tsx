"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type PlaylistKitManageItem = {
  id: string;
  name: string;
  artist: string;
  cover_url: string | null;
};

type ManagePlaylistKitsListProps = {
  playlistId: string;
  kits: PlaylistKitManageItem[];
  removeKitAction: (formData: FormData) => Promise<void>;
};

function RemoveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Removendo..." : "Remover"}
    </button>
  );
}

export function ManagePlaylistKitsList({ playlistId, kits, removeKitAction }: ManagePlaylistKitsListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (kits.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-3 py-4 text-center text-xs text-zinc-500">
        Esta playlist ainda está vazia.
      </div>
    );
  }

  const visibleKits = isExpanded ? kits : kits.slice(0, 3);
  const remainingCount = Math.max(kits.length - visibleKits.length, 0);

  return (
    <div className="space-y-2">
      {visibleKits.map((kit) => (
        <div key={kit.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-white/5">
            {kit.cover_url ? (
              <img src={kit.cover_url} alt={kit.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-500">Kit</div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{kit.name}</p>
            <p className="truncate text-xs text-zinc-400">{kit.artist}</p>
          </div>

          <form action={removeKitAction}>
            <input type="hidden" name="playlistId" value={playlistId} />
            <input type="hidden" name="kitId" value={kit.id} />
            <RemoveButton />
          </form>
        </div>
      ))}

      {kits.length > 3 ? (
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/10"
        >
          {isExpanded ? "Mostrar menos" : `Mostrar mais ${remainingCount} kit${remainingCount === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </div>
  );
}
