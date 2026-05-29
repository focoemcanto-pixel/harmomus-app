"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyInviteLink({ href }: { href: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const absoluteUrl = href.startsWith("http") ? href : `${window.location.origin}${href}`;
    await navigator.clipboard.writeText(absoluteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-white/10 hover:text-white"
      aria-label="Copiar link do convite"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-200" /> : <Copy className="h-3.5 w-3.5 text-cyan-200" />}
      {copied ? "Copiado" : "Copiar link"}
    </button>
  );
}
