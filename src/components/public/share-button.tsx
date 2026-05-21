"use client";

import { useState } from "react";

export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const shareData = { title, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // noop
    }
  }

  return (
    <button type="button" onClick={handleShare} className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/5">
      Compartilhar {copied ? "• Link copiado" : ""}
    </button>
  );
}
