"use client";

import Link from "next/link";
import { useState } from "react";

import { ShareButton } from "@/components/public/share-button";

export function KitActionsMenu({
  kitName,
  kitSlug,
  categorySlug,
  planSlug,
}: {
  kitName: string;
  kitSlug: string;
  categorySlug?: string | null;
  planSlug?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const isPremium = planSlug === "premium";
  const requestToneHref = isPremium
    ? `/area-premium?kit=${encodeURIComponent(kitSlug)}&kitName=${encodeURIComponent(kitName)}#solicitar-tom`
    : "/assinar?plan=premium&reason=novo-tom";

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-sm text-white">Ações</button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-white/10 bg-[#0d1019] p-2 shadow-premium">
          <ShareButton title={kitName} />
          <Link href={`/criar-playlist?kit=${kitSlug}`} className="mt-1 block rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5">Salvar na playlist</Link>
          <Link href={requestToneHref} className={`mt-1 block rounded-lg border px-3 py-2 text-sm hover:bg-white/5 ${isPremium ? "border-emerald-400/25 text-emerald-200" : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"}`}>
            Solicitar novo tom
          </Link>
          {!isPremium ? <p className="mt-2 rounded-lg bg-yellow-400/10 px-3 py-2 text-xs leading-relaxed text-yellow-100">Recurso Premium: atualize seu plano para pedir novos tons e acessar todos os recursos.</p> : null}
          {categorySlug ? <Link href={`/categoria/${categorySlug}`} className="mt-1 block rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5">Ir para categoria</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
