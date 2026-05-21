"use client";

interface KitOption { id: string; name: string; artist: string; slug: string; }

export function PlaylistKitSearch({ kits, query, onQueryChange, onAdd, selectedIds }: { kits: KitOption[]; query: string; onQueryChange: (value: string) => void; onAdd: (kit: KitOption) => void; selectedIds: string[]; }) {
  return <div><input value={query} onChange={(e)=>onQueryChange(e.target.value)} placeholder="Buscar kits publicados" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white" /><div className="mt-3 space-y-2">{kits.map((kit)=><button key={kit.id} type="button" disabled={selectedIds.includes(kit.id)} onClick={()=>onAdd(kit)} className="flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-zinc-200 disabled:opacity-50"><span>{kit.name} • {kit.artist}</span><span>Adicionar</span></button>)}</div></div>;
}
