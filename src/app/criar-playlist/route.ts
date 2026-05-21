import { createPlaylist } from "@/lib/data/playlists";

export async function POST(request: Request) {
  const body = await request.json();
  try {
    const playlist = await createPlaylist(body);
    return Response.json({ slug: playlist.slug });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
