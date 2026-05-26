import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BASE_SELECT = "id,kit_id,tone,name,r2_key,public_url,file_type";
const TESSITURA_SELECT = `${BASE_SELECT},min_midi_note,max_midi_note,detected_min_midi_note,detected_max_midi_note,tessitura_confidence,tessitura_source`;

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompletedAudioJob = {
  id: string;
  kit_id: string;
  generated_audio_file_id?: string | null;
  voice: string | null;
  target_tone: string | null;
  target_r2_key: string | null;
  output_file_type: string | null;
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createSupabaseAdminClient() as any;

    await reconcileGeneratedAudioFiles(supabase, id);

    const { files, hasTessituraColumns } = await getAudioFiles(supabase, id);

    const grouped = new Map<string, any[]>();
    for (const file of files ?? []) {
      const tone = normalizeTone(file.tone);
      if (!tone) continue;

      const list = grouped.get(tone) ?? [];
      list.push({
        id: file.id,
        name: file.name,
        key: file.r2_key,
        url: file.public_url,
        streamUrl: `/api/audio/${file.id}`,
        tone,
        voice: normalizeVoice(file.name),
        fileType: file.file_type,
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao buscar áudios.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function reconcileGeneratedAudioFiles(supabase: any, kitId: string) {
  const { data: jobs, error } = await supabase
    .from("audio_generation_jobs")
    .select("id,kit_id,generated_audio_file_id,voice,target_tone,target_r2_key,output_file_type")
    .eq("kit_id", kitId)
    .eq("status", "completed");

  if (error) {
    // Ambientes antigos podem ainda não ter a tabela de jobs. A lista de áudios deve continuar funcionando.
    console.warn("[audio-files] Could not reconcile generated audio jobs", { kitId, error });
    return;
  }

  for (const job of ((jobs ?? []) as CompletedAudioJob[])) {
    const tone = normalizeTone(job.target_tone);
    const r2Key = String(job.target_r2_key ?? "").trim();
    if (!tone || !r2Key) continue;

    const voice = normalizeVoice(job.voice ?? "todos");
    const fileType = String(job.output_file_type ?? "mp3").replace(/^\./, "") || "mp3";

    const { data: existing, error: findError } = await supabase
      .from("kit_audio_files")
      .select("id")
      .eq("kit_id", kitId)
      .eq("r2_key", r2Key)
      .maybeSingle();

    if (findError) {
      console.warn("[audio-files] Could not check generated audio file", { kitId, jobId: job.id, error: findError });
      continue;
    }

    let audioFileId = existing?.id as string | undefined;

    if (!audioFileId) {
      const { data: inserted, error: insertError } = await supabase
        .from("kit_audio_files")
        .insert({
          kit_id: kitId,
          tone,
          name: voice,
          r2_key: r2Key,
          public_url: r2Key,
          file_type: fileType,
        })
        .select("id")
        .maybeSingle();

      if (insertError) {
        console.error("[audio-files] Could not insert generated audio file", { kitId, jobId: job.id, error: insertError });
        continue;
      }

      audioFileId = inserted?.id as string | undefined;
    }

    if (audioFileId && job.generated_audio_file_id !== audioFileId) {
      const { error: updateJobError } = await supabase
        .from("audio_generation_jobs")
        .update({ generated_audio_file_id: audioFileId })
        .eq("id", job.id);

      if (updateJobError) {
        console.warn("[audio-files] Could not link generated audio file to job", { kitId, jobId: job.id, error: updateJobError });
      }
    }
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
