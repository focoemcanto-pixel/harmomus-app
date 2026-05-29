import { NextResponse } from "next/server";

import { toggleFavoriteKit } from "@/lib/data/favorites";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const kitId = String(body?.kitId ?? "").trim();

    if (!kitId) {
      return NextResponse.json({ error: "Kit obrigatório." }, { status: 400 });
    }

    const result = await toggleFavoriteKit(kitId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar favorito." },
      { status: 400 },
    );
  }
}
