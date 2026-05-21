import { NextResponse } from "next/server";

import { getKitById, saveKitAudioSync } from "@/lib/data/kits";
import { listKitAudioFiles } from "@/lib/r2/list-audio-files";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const kit = await getKitById(id);

    if (!kit) {
      return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
    }

    if (!kit.r2_folder?.trim()) {
      return NextResponse.json({ error: "Este kit não possui pasta R2 configurada." }, { status: 400 });
    }

    const syncData = await listKitAudioFiles(kit.r2_folder);
    await saveKitAudioSync(kit.id, syncData.tones);

    return NextResponse.json({
      success: true,
      kitId: kit.id,
      r2Folder: kit.r2_folder,
      tones: syncData.tones,
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
