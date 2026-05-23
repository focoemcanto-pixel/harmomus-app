import { PublicAppShell } from "@/components/public/public-app-shell";
import { notFound } from "next/navigation";

import { PlaylistPlayerClient } from "@/components/public/playlist-player-client";
import { getPlaylistBySlug } from "@/lib/data/playlists";

export default async function PlaylistPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const playlist = await getPlaylistBySlug(slug);
  if (!playlist) notFound();

  return <PublicAppShell><PlaylistPlayerClient playlist={playlist} /></PublicAppShell>;
}
