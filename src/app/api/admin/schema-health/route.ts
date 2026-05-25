import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const KIT_TONE_COLUMNS = [
  "original_tone",
  "default_tone",
  "allow_pitch_shift",
  "max_pitch_shift_semitones",
] as const;

const AUDIO_TESSITURA_COLUMNS = [
  "min_midi_note",
  "max_midi_note",
  "detected_min_midi_note",
  "detected_max_midi_note",
  "tessitura_confidence",
  "tessitura_source",
] as const;

export async function GET() {
  try {
    const current = await getCurrentUserAccessContext();

    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const supabase = (await createClient()) as any;

    const [kitToneStatus, audioTessituraStatus] = await Promise.all([
      checkColumns(supabase, "kits", KIT_TONE_COLUMNS),
      checkColumns(supabase, "kit_audio_files", AUDIO_TESSITURA_COLUMNS),
    ]);

    return NextResponse.json({
      ok: kitToneStatus.ok && audioTessituraStatus.ok,
      modules: {
        kitToneMetadata: kitToneStatus,
        audioTessituraMetadata: audioTessituraStatus,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao verificar schema.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function checkColumns(
  supabase: any,
  table: string,
  columns: readonly string[],
): Promise<{ ok: boolean; table: string; availableColumns: string[]; missingColumns: string[] }> {
  const availableColumns: string[] = [];
  const missingColumns: string[] = [];

  for (const column of columns) {
    const { error } = await supabase
      .from(table)
      .select(column)
      .limit(1);

    if (error) missingColumns.push(column);
    else availableColumns.push(column);
  }

  return {
    ok: missingColumns.length === 0,
    table,
    availableColumns,
    missingColumns,
  };
}
