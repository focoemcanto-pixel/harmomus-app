"use client";

import Link from "next/link";
import { useState } from "react";

import { ShareButton } from "@/components/public/share-button";

export function KitActionsMenu({ kitName, kitSlug, categorySlug }: { kitName: string; kitSlug: string; categorySlug?: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-sm text-white">Ações</button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-white/10 bg-[#0d1019] p-2 shadow-premium">
          <ShareButton title={kitName} />
          <Link href={`/criar-playlist?kit=${kitSlug}`} className="mt-1 block rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5">Salvar na playlist</Link>
          {categorySlug ? <Link href={`/categoria/${categorySlug}`} className="mt-1 block rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5">Ir para categoria</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
