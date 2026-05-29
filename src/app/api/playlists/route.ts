import { createPlaylist } from "@/lib/data/playlists";

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
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
    return Response.json({ slug: playlist.slug });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao criar playlist." }, { status: 400 });
  }
}
