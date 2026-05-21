import { CreatePlaylistForm } from "@/components/public/create-playlist-form";
import { getPublishedKitsForPlaylist, searchPublishedKits } from "@/lib/data/playlists";
import { getPublishedKitBySlug } from "@/lib/data/public-kits";

export default async function CriarPlaylistPage({ searchParams }: { searchParams: Promise<{ kit?: string; kit_id?: string }> }) {
  const params = await searchParams;
  const kits = await getPublishedKitsForPlaylist();
  let initialSelectedKit = null;
  if (params.kit) initialSelectedKit = await getPublishedKitBySlug(params.kit);
  if (!initialSelectedKit && params.kit_id) initialSelectedKit = (await searchPublishedKits("")).find((k: any) => k.id === params.kit_id) ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2840_0%,#06070c_40%)] p-4 md:p-8">
      <CreatePlaylistForm
        initialKits={kits}
        initialSelectedKit={initialSelectedKit ? { id: initialSelectedKit.id, name: initialSelectedKit.name, artist: initialSelectedKit.artist, slug: initialSelectedKit.slug } : null}
      />
    </main>
  );
}
