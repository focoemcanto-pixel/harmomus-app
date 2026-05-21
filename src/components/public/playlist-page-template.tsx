import Link from "next/link";
import { PlaylistShareActions } from "@/components/public/playlist-share-actions";
import type { PublicPlaylist } from "@/lib/data/playlists";

export function PlaylistPageTemplate({ playlist }: { playlist: PublicPlaylist }) {
  const publicUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/playlist/${playlist.slug}`;
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8"><section className="mx-auto w-full max-w-4xl rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-premium"><h1 className="text-3xl font-semibold text-white">{playlist.name}</h1><PlaylistShareActions url={publicUrl} /><div className="mt-6 space-y-3">{playlist.kits.map((kit)=><article key={kit.id} className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:grid-cols-[80px_1fr_auto]"><img src={kit.cover_url ?? "https://placehold.co/300x300/101114/f4f4f5?text=Kit"} alt={kit.name} className="h-20 w-20 rounded-lg object-cover"/><div><p className="text-lg text-white">{kit.name}</p><p className="text-sm text-zinc-300">{kit.artist}</p><p className="text-xs text-gold-300">{kit.category?.name ?? "Sem categoria"}</p></div><Link href={`/biblioteca/${kit.slug}`} className="self-center rounded-lg border border-white/10 px-3 py-2 text-sm text-white">Abrir kit</Link></article>)}</div></section></main>;
}
