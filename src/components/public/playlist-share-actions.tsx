"use client";

export function PlaylistShareActions({ url }: { url: string }) {
  const wa = `https://wa.me/?text=${encodeURIComponent(url)}`;
  return <div className="mt-4 flex gap-3"><button onClick={()=>navigator.clipboard.writeText(url)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white">Copiar link</button><a href={wa} target="_blank" className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white">Compartilhar no WhatsApp</a></div>;
}
