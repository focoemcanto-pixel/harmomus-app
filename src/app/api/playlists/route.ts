import { addKitToPlaylist, createPlaylist, getCurrentUserPlaylists } from "@/lib/data/playlists";

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export async function GET() {
  try {
    const playlists = await getCurrentUserPlaylists();
    return Response.json({ playlists });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao carregar playlists." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const name = String(body?.name ?? "").trim();
    const kitIds = asStringArray(body?.kitIds);

    if (!name) {
      return Response.json({ error: "Informe o nome da playlist." }, { status: 400 });
    }

    if (!kitIds.length) {
      return Response.json({ error: "Selecione ao menos um kit." }, { status: 400 });
    }

    const playlist = await createPlaylist({ name, kitIds });
    return Response.json({ id: playlist.id, slug: playlist.slug });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao criar playlist." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const playlistId = String(body?.playlistId ?? "").trim();
    const kitId = String(body?.kitId ?? "").trim();

    if (!playlistId || !kitId) {
      return Response.json({ error: "Informe a playlist e o kit." }, { status: 400 });
    }

    await addKitToPlaylist(playlistId, kitId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao adicionar kit à playlist." }, { status: 400 });
  }
}
