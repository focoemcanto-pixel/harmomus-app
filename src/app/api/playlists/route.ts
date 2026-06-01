import { addKitToPlaylist, createPlaylist, getCurrentUserPlaylists } from "@/lib/data/playlists";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveKitId(reference: string) {
  if (isUuid(reference)) return reference;

  const supabase = createSupabaseAdminClient() as any;
  const { data, error } = await supabase
    .from("kits")
    .select("id")
    .eq("slug", reference)
    .eq("published", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Kit não encontrado ou indisponível.");

  return data.id;
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

    const resolvedKitIds = await Promise.all(kitIds.map(resolveKitId));
    const playlist = await createPlaylist({ name, kitIds: resolvedKitIds });
    return Response.json({ id: playlist.id, slug: playlist.slug });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao criar playlist." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const playlistId = String(body?.playlistId ?? "").trim();
    const kitReference = String(body?.kitId ?? body?.kitSlug ?? "").trim();

    if (!playlistId || !kitReference) {
      return Response.json({ error: "Informe a playlist e o kit." }, { status: 400 });
    }

    const kitId = await resolveKitId(kitReference);
    await addKitToPlaylist(playlistId, kitId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao adicionar kit à playlist." }, { status: 400 });
  }
}
