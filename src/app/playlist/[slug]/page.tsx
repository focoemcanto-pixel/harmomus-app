import { notFound } from "next/navigation";

import { PlaylistPageTemplate } from "@/components/public/playlist-page-template";
import { getPlaylistBySlug } from "@/lib/data/playlists";

export default async function PlaylistPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const playlist = await getPlaylistBySlug(slug);
  if (!playlist) notFound();

  return <PlaylistPageTemplate playlist={playlist} />;
}
