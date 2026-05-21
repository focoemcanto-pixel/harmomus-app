"use client";

interface KitOption { id: string; name: string; artist: string; slug: string; }

export function PlaylistSelectedList({ kits, onRemove }: { kits: KitOption[]; onRemove: (id: string) => void }) {
  return <div className="space-y-2">{kits.map((kit)=><div key={kit.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"><span className="text-sm text-white">{kit.name} • {kit.artist}</span><button type="button" onClick={()=>onRemove(kit.id)} className="text-xs text-rose-300">Remover</button></div>)}</div>;
}
