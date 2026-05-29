import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BASE_SELECT = "id,kit_id,tone,name,file_type,source_type";
const TESSITURA_SELECT = `${BASE_SELECT},min_midi_note,max_midi_note,detected_min_midi_note,detected_max_midi_note,tessitura_confidence,tessitura_source`;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createSupabaseAdminClient() as any;

    const { data: kit, error: kitError } = await supabase
      .from("kits")
      .select("id,published")
      .eq("id", id)
      .maybeSingle();

    if (kitError) throw new Error(kitError.message);
    if (!kit?.id || kit.published !== true) {
      return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
    }

    const { files, hasTessituraColumns } = await getAudioFiles(supabase, id);

    const grouped = new Map<string, any[]>();
    for (const file of files ?? []) {
      const tone = normalizeTone(file.tone);
      if (!tone) continue;

      const source = file.source_type;
      if (!isAudioSourceType(source)) continue;
      const list = grouped.get(tone) ?? [];
      list.push({
        id: file.id,
        name: file.name,
        streamUrl: `/api/audio/${file.id}`,
        tone,
        voice: normalizeVoice(file.name),
        fileType: file.file_type,
        source_type: source,
        source,
        isGenerated: source === "generated",
        minMidiNote: file.min_midi_note ?? null,
        maxMidiNote: file.max_midi_note ?? null,
        detectedMinMidiNote: file.detected_min_midi_note ?? null,
        detectedMaxMidiNote: file.detected_max_midi_note ?? null,
        tessituraConfidence: file.tessitura_confidence ?? null,
        tessituraSource: file.tessitura_source ?? "manual",
      });
      grouped.set(tone, list);
    }

    return NextResponse.json({
      hasTessituraColumns,
      tones: Array.from(grouped.entries()).map(([tone, toneFiles]) => ({
        tone,
        files: toneFiles,
      })),
    }, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
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

function isAudioSourceType(sourceType: string | null | undefined): sourceType is "original" | "generated" {
  return sourceType === "original" || sourceType === "generated";
}

function normalizeTone(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/♯/g, "#")
    .replace(/＃/g, "#")
    .replace(/\s+/g, "")
    .toUpperCase();

  const flatMap: Record<string, string> = {
    DB: "C#",
    EB: "D#",
    GB: "F#",
    AB: "G#",
    BB: "A#",
  };

  return flatMap[normalized] ?? normalized;
}

function normalizeVoice(value: string | null | undefined) {
  const normalized = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (normalized.includes("soprano")) return "soprano";
  if (normalized.includes("contralto")) return "contralto";
  if (normalized.includes("tenor")) return "tenor";
  return "todos";
}
