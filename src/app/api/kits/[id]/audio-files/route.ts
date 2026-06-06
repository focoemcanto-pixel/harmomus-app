import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BASE_SELECT = "id,kit_id,tone,name,file_type,source_type";
const TESSITURA_SELECT = `${BASE_SELECT},min_midi_note,max_midi_note,detected_min_midi_note,detected_max_midi_note,tessitura_confidence,tessitura_source`;

type MidiRangeJson = {
  min_midi?: number | null;
  max_midi?: number | null;
  min_note?: string | null;
  max_note?: string | null;
};

type MusicalLayersJson = {
  musical_range?: MidiRangeJson | null;
  dominant_range?: MidiRangeJson | null;
  absolute_range?: MidiRangeJson | null;
  real_range?: MidiRangeJson | null;
  peak_notes?: unknown[] | null;
  note_distribution?: unknown[] | null;
};

type AnalysisJobRow = {
  audio_file_id: string | null;
  pitch_events_json?: {
    musical_layers?: MusicalLayersJson | null;
  } | null;
  detected_min_midi?: number | null;
  detected_max_midi?: number | null;
  comfort_min_midi?: number | null;
  comfort_max_midi?: number | null;
  vocal_confidence?: number | null;
  completed_at?: string | null;
};

function signedAudioPath(audioFileId: string) {
  return `/api/audio/${audioFileId}/signed`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await getCurrentUserAccessContext();
    const { id } = await params;
    const supabase = createSupabaseAdminClient() as any;

    const { data: kit, error: kitError } = await supabase
      .from("kits")
      .select("id,published")
      .eq("id", id)
      .maybeSingle();

    if (kitError) throw new Error(kitError.message);
    if (!kit?.id || (!current.isAdmin && kit.published !== true)) {
      return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });
    }

    const { files, hasTessituraColumns } = await getAudioFiles(supabase, id);
    const analysisByFileId = await getLatestAnalysisByFileId(supabase, id);

    const grouped = new Map<string, any[]>();
    for (const file of files ?? []) {
      const tone = normalizeTone(file.tone);
      if (!tone) continue;

      const source = file.source_type;
      if (!isAudioSourceType(source)) continue;
      const analysis = analysisByFileId.get(String(file.id));
      const musicalLayers = analysis?.pitch_events_json?.musical_layers ?? null;
      const musicalRange = musicalLayers?.musical_range ?? null;
      const dominantRange = musicalLayers?.dominant_range ?? null;
      const absoluteRange = musicalLayers?.absolute_range ?? musicalLayers?.real_range ?? null;
      const musicalMin = typeof musicalRange?.min_midi === "number" ? musicalRange.min_midi : null;
      const musicalMax = typeof musicalRange?.max_midi === "number" ? musicalRange.max_midi : null;
      const list = grouped.get(tone) ?? [];
      list.push({
        id: file.id,
        name: file.name,
        streamUrl: signedAudioPath(file.id),
        tone,
        voice: normalizeVoice(file.name),
        fileType: file.file_type,
        source_type: source,
        source,
        isGenerated: source === "generated",
        minMidiNote: musicalMin ?? file.min_midi_note ?? null,
        maxMidiNote: musicalMax ?? file.max_midi_note ?? null,
        detectedMinMidiNote: musicalMin ?? file.detected_min_midi_note ?? analysis?.detected_min_midi ?? null,
        detectedMaxMidiNote: musicalMax ?? file.detected_max_midi_note ?? analysis?.detected_max_midi ?? null,
        absoluteMinMidiNote: absoluteRange?.min_midi ?? analysis?.detected_min_midi ?? null,
        absoluteMaxMidiNote: absoluteRange?.max_midi ?? analysis?.detected_max_midi ?? null,
        dominantMinMidiNote: dominantRange?.min_midi ?? null,
        dominantMaxMidiNote: dominantRange?.max_midi ?? null,
        musicalMinMidiNote: musicalMin,
        musicalMaxMidiNote: musicalMax,
        peakNotes: Array.isArray(musicalLayers?.peak_notes) ? musicalLayers?.peak_notes : [],
        noteDistribution: Array.isArray(musicalLayers?.note_distribution) ? musicalLayers?.note_distribution : [],
        tessituraConfidence: analysis?.vocal_confidence ?? file.tessitura_confidence ?? null,
        tessituraSource: analysis ? "hybrid" : file.tessitura_source ?? "manual",
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
        "Cache-Control": "no-store",
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

async function getLatestAnalysisByFileId(supabase: any, kitId: string) {
  const { data, error } = await supabase
    .from("audio_analysis_jobs")
    .select("audio_file_id,pitch_events_json,detected_min_midi,detected_max_midi,comfort_min_midi,comfort_max_midi,vocal_confidence,completed_at")
    .eq("kit_id", kitId)
    .eq("analysis_type", "tessitura")
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  if (error) {
    console.warn("[audio-files] could not load tessitura analysis jobs", error.message);
    return new Map<string, AnalysisJobRow>();
  }

  const byFileId = new Map<string, AnalysisJobRow>();
  for (const row of (data ?? []) as AnalysisJobRow[]) {
    if (!row.audio_file_id) continue;
    if (byFileId.has(row.audio_file_id)) continue;
    byFileId.set(row.audio_file_id, row);
  }
  return byFileId;
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
