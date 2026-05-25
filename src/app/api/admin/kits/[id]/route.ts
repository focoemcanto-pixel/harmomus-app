import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { ensureArtistCategory, updateKit } from "@/lib/data/kits";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await getCurrentUserAccessContext();

    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const name = String(body.name ?? "").trim();
    const slug = String(body.slug ?? "").trim();
    const artist = String(body.artist ?? "").trim();

    if (!name || !slug || !artist) {
      return NextResponse.json({ error: "Preencha nome, slug e artista para continuar." }, { status: 400 });
    }

    const artistCategory = await ensureArtistCategory(artist);
    const maxPitchShift = Number(body.max_pitch_shift_semitones ?? 2);

    const updated = await updateKit(id, {
      name,
      slug,
      artist,
      description: String(body.description ?? "").trim() || null,
      lyrics: String(body.lyrics ?? "").trim() || null,
      cover_url: String(body.cover_url ?? "").trim() || null,
      r2_folder: String(body.r2_folder ?? "").trim() || null,
      category_id: String(body.category_id ?? "") || artistCategory.id,
      required_plan: String(body.required_plan ?? "") || null,
      original_tone: String(body.original_tone ?? "").trim() || null,
      default_tone: String(body.default_tone ?? "").trim() || null,
      allow_pitch_shift: Boolean(body.allow_pitch_shift),
      max_pitch_shift_semitones: Number.isFinite(maxPitchShift) ? maxPitchShift : 2,
      published: Boolean(body.published),
    } as any);

    return NextResponse.json({ success: true, kit: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao salvar kit.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
