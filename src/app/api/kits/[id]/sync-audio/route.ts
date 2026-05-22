import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { getKitById, saveKitAudioSync } from "@/lib/data/kits";
import { listKitAudioFilesWithFallbacks } from "@/lib/r2/list-audio-files";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await getCurrentUserAccessContext();
    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const { id } = await params;
    const kit = await getKitById(id);

    if (!kit) {
      return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
    }

    if (!kit.r2_folder?.trim()) {
      return NextResponse.json({ error: "Este kit não possui pasta R2 configurada." }, { status: 400 });
    }

    const syncData = await listKitAudioFilesWithFallbacks({
      r2Folder: kit.r2_folder,
      slug: kit.slug,
      kitName: kit.name,
    });
    await saveKitAudioSync(kit.id, syncData.tones);

    return NextResponse.json({
      success: true,
      kitId: kit.id,
      r2Folder: kit.r2_folder,
      tones: syncData.tones,
      usedPrefix: syncData.usedPrefix,
      attemptedPrefixes: syncData.attemptedPrefixes,
      totals: {
        tones: syncData.tones.length,
        files: syncData.tones.reduce((sum, tone) => sum + tone.files.length, 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao sincronizar áudios.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
