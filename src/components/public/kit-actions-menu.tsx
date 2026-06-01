"use client";

import Link from "next/link";
import { useState } from "react";

import { PlaylistSaveDialog } from "@/components/public/playlist-save-dialog";
import { ShareButton } from "@/components/public/share-button";
import { canSavePlaylist } from "@/lib/access/access-engine";

export function KitActionsMenu({
  kitId,
  kitName,
  kitSlug,
  categorySlug,
  planSlug,
  canRequestSongsAndTones = planSlug === "premium",
  onPremiumRequired,
}: {
  kitId: string;
  kitName: string;
  kitSlug: string;
  categorySlug?: string | null;
  planSlug?: string | null;
  canRequestSongsAndTones?: boolean;
  onPremiumRequired?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const isPremium = planSlug === "premium";
  const canRequestTone = isPremium && canRequestSongsAndTones;
  const isPremiumWithoutRequestPermission = isPremium && !canRequestSongsAndTones;
  const canUsePlaylists = canSavePlaylist(planSlug);

  const requestToneHref = `/area-premium?kit=${encodeURIComponent(kitSlug)}&nome=${encodeURIComponent(kitName)}#solicitar-tom`;

  function handleBlockedPremiumAction() {
    setOpen(false);
    onPremiumRequired?.();
  }

  function openPlaylistDialog() {
    setOpen(false);
    setPlaylistOpen(true);
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-sm text-white">Ações</button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-white/10 bg-[#0d1019] p-2 shadow-premium">
          <ShareButton title={kitName} />

          {canUsePlaylists ? (
            <button
              type="button"
              onClick={openPlaylistDialog}
              className="mt-1 block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5"
            >
              Salvar na playlist
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBlockedPremiumAction}
              className="mt-1 block w-full rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-3 py-2 text-left text-sm text-yellow-100 hover:bg-white/5"
            >
              Salvar na playlist
            </button>
          )}

          {canRequestTone ? (
            <Link href={requestToneHref} className="mt-1 block rounded-lg border border-emerald-400/25 px-3 py-2 text-sm text-emerald-200 hover:bg-white/5">
              Solicitar novo tom
            </Link>
          ) : isPremiumWithoutRequestPermission ? null : (
            <button
              type="button"
              onClick={handleBlockedPremiumAction}
              className="mt-1 block w-full rounded-lg border border-yellow-400/25 bg-yellow-400/10 px-3 py-2 text-left text-sm text-yellow-100 hover:bg-white/5"
            >
              Solicitar novo tom
            </button>
          )}

          {!canRequestTone && !isPremiumWithoutRequestPermission ? (
            <p className="mt-2 rounded-lg bg-yellow-400/10 px-3 py-2 text-xs leading-relaxed text-yellow-100">
              Recurso Premium: faça upgrade para pedir novos tons e acessar todos os recursos.
            </p>
          ) : null}

          {isPremiumWithoutRequestPermission ? (
            <p className="mt-2 rounded-lg bg-cyan-400/10 px-3 py-2 text-xs leading-relaxed text-cyan-100">
              Solicitações de novos tons são centralizadas pelo responsável do plano ministerial.
            </p>
          ) : null}

          {categorySlug ? (
            <Link href={`/categoria/${categorySlug}`} className="mt-1 block rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5">
              Ir para categoria
            </Link>
          ) : null}
        </div>
      ) : null}

      {canUsePlaylists ? (
        <PlaylistSaveDialog
          open={playlistOpen}
          kitId={kitId}
          kitSlug={kitSlug}
          kitName={kitName}
          onClose={() => setPlaylistOpen(false)}
        />
      ) : null}
    </div>
  );
}
