import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await getCurrentUserAccessContext();
    const { id } = await params;
    const supabase = createSupabaseAdminClient() as any;

    const { data: kit, error } = await supabase
      .from("kits")
      .select("id,name,artist,lyrics,published")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!kit?.id || (!current.isAdmin && kit.published !== true)) {
      return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
    }

    return NextResponse.json(
      {
        id: kit.id,
        name: kit.name,
        artist: kit.artist,
        lyrics: kit.lyrics ?? "",
      },
      { headers: { "Cache-Control": "private, max-age=120" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao buscar letra.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
