import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { CreatePlaylistForm } from "@/components/public/create-playlist-form";
import { canSavePlaylist } from "@/lib/access/access-engine";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getPublishedKitsForPlaylist, searchPublishedKits } from "@/lib/data/playlists";
import { getPublishedKitBySlug } from "@/lib/data/public-kits";

export default async function CriarPlaylistPage({ searchParams }: { searchParams: Promise<{ kit?: string; kit_id?: string }> }) {
  const [params, current] = await Promise.all([
    searchParams,
    getCurrentUserAccessContext(),
  ]);

  if (!canSavePlaylist(current.effectiveSlug)) {
    redirect("/assinar?upgrade=playlist");
  }

  const kits = await getPublishedKitsForPlaylist();
  let initialSelectedKit = null;
  if (params.kit) initialSelectedKit = await getPublishedKitBySlug(params.kit);
  if (!initialSelectedKit && params.kit_id) initialSelectedKit = (await searchPublishedKits("")).find((k: any) => k.id === params.kit_id) ?? null;

  const isMinistryAccess = Boolean(current.ministry);

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8">
        {isMinistryAccess ? (
          <div className="mx-auto mb-5 max-w-5xl rounded-3xl border border-cyan-300/20 bg-cyan-400/10 p-5 text-sm leading-6 text-cyan-50 shadow-[0_20px_70px_rgba(34,211,238,0.10)]">
            <p className="font-bold text-white">Playlist pessoal</p>
            <p className="mt-1 text-cyan-50/90">
              Você está usando o Premium via ministério, mas esta playlist será salva apenas na sua conta. O compartilhamento com todo o ministério será tratado em um recurso próprio.
            </p>
          </div>
        ) : null}
        <CreatePlaylistForm
          initialKits={kits}
          initialSelectedKit={initialSelectedKit ? { id: initialSelectedKit.id, name: initialSelectedKit.name, artist: initialSelectedKit.artist, slug: initialSelectedKit.slug } : null}
        />
      </main>
    </PublicAppShell>
  );
}
