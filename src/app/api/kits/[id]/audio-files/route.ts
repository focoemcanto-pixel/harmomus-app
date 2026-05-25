import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

const BASE_SELECT = "id,kit_id,tone,name,r2_key,public_url,file_type";
const TESSITURA_SELECT = `${BASE_SELECT},min_midi_note,max_midi_note,detected_min_midi_note,detected_max_midi_note,tessitura_confidence,tessitura_source`;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await getCurrentUserAccessContext();
    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const { id } = await params;
    const supabase = (await createClient()) as any;

    const { files, hasTessituraColumns } = await getAudioFiles(supabase, id);

    const grouped = new Map<string, any[]>();
    for (const file of files ?? []) {
      const list = grouped.get(file.tone) ?? [];
      list.push({
        id: file.id,
        name: file.name,
        key: file.r2_key,
        url: file.public_url,
        tone: file.tone,
        voice: normalizeVoice(file.name),
        fileType: file.file_type,
        minMidiNote: file.min_midi_note ?? null,
        maxMidiNote: file.max_midi_note ?? null,
        detectedMinMidiNote: file.detected_min_midi_note ?? null,
        detectedMaxMidiNote: file.detected_max_midi_note ?? null,
        tessituraConfidence: file.tessitura_confidence ?? null,
        tessituraSource: file.tessitura_source ?? "manual",
      });
      grouped.set(file.tone, list);
    }

    return NextResponse.json({
      hasTessituraColumns,
      tones: Array.from(grouped.entries()).map(([tone, toneFiles]) => ({
        tone,
        files: toneFiles,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao buscar áudios.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function getAudioFiles(supabase: any, kitId: string) {
  const query = (select: string) => supabase
    .from("kit_audio_files")
    .select(select)
    .eq("kit_id", kitId)
    .order("tone", { ascending: true })
    .order("name", { ascending: true });

  const { data, error } = await query(TESSITURA_SELECT);
  if (!error) return { files: data ?? [], hasTessituraColumns: true };

  const { data: fallbackData, error: fallbackError } = await query(BASE_SELECT);
  if (fallbackError) throw new Error(fallbackError.message);

  return { files: fallbackData ?? [], hasTessituraColumns: false };
}

function normalizeVoice(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (normalized.includes("soprano")) return "soprano";
  if (normalized.includes("contralto")) return "contralto";
  if (normalized.includes("tenor")) return "tenor";
  return "todos";
}
