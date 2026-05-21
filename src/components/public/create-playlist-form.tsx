"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlaylistKitSearch } from "@/components/public/playlist-kit-search";
import { PlaylistSelectedList } from "@/components/public/playlist-selected-list";

interface KitOption { id: string; name: string; artist: string; slug: string; }

export function CreatePlaylistForm({ initialKits, initialSelectedKit }: { initialKits: KitOption[]; initialSelectedKit?: KitOption | null }) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<KitOption[]>(initialSelectedKit ? [initialSelectedKit] : []);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const filtered = useMemo(()=> initialKits.filter((k)=>`${k.name} ${k.artist}`.toLowerCase().includes(query.toLowerCase())), [initialKits, query]);

  async function onCreate() {
    setLoading(true);
    const res = await fetch('/criar-playlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, kitIds: selected.map((k)=>k.id) })});
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { alert(data.error ?? 'Erro ao criar playlist'); return; }
    router.push(`/playlist/${data.slug}`);
  }

  return <section className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1019] p-6 shadow-premium"><h1 className="text-3xl font-semibold text-white">Criar minha playlist</h1><input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Nome da playlist" className="mt-5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-white"/><div className="mt-5"><PlaylistKitSearch kits={filtered} query={query} onQueryChange={setQuery} onAdd={(kit)=>setSelected((prev)=>prev.find((p)=>p.id===kit.id)||prev.length>=20?prev:[...prev,kit])} selectedIds={selected.map((k)=>k.id)} /></div><div className="mt-5"><PlaylistSelectedList kits={selected} onRemove={(id)=>setSelected((prev)=>prev.filter((k)=>k.id!==id))} /></div><button onClick={onCreate} disabled={loading} className="mt-6 w-full rounded-lg bg-emerald-500 px-4 py-3 font-medium text-black disabled:opacity-50">Criar playlist</button></section>;
}
