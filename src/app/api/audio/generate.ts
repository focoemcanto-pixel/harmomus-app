import { NextRequest, NextResponse } from "next/server";

import { getSignedSemitoneDistance, normalizeTone } from "@/lib/music/tones";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const VALID_VOICES = new Set(["todos", "tenor", "contralto", "soprano"]);

function normalizeVoice(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sanitizePathPart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/#/g, "sharp")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function buildTargetR2Key({ kitSlug, voice, targetTone }: { kitSlug: string; voice: string; targetTone: string }) {
  return `kits/${sanitizePathPart(kitSlug)}/${sanitizePathPart(voice)}/${sanitizePathPart(targetTone)}.mp3`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const sourceAudioFileId = String(body?.sourceAudioFileId ?? "").trim();
    const requestedVoice = normalizeVoice(body?.voice);
    const targetTones = Array.from(
      new Set((body?.targetTones ?? []).map((tone: string) => normalizeTone(tone)).filter(Boolean)),
    );

    if (!sourceAudioFileId) {
      return NextResponse.json({ error: "sourceAudioFileId é obrigatório." }, { status: 400 });
    }

    if (!VALID_VOICES.has(requestedVoice)) {
      return NextResponse.json({ error: "voice inválido." }, { status: 400 });
    }

    if (targetTones.length === 0) {
      return NextResponse.json({ error: "Nenhum targetTone válido informado." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient() as any;

    const { data: sourceFile, error: sourceError } = await supabase
      .from("kit_audio_files")
      .select("id,kit_id,tone,name,r2_key,kits(slug)")
      .eq("id", sourceAudioFileId)
      .maybeSingle();

    if (sourceError) throw new Error(sourceError.message);

    if (!sourceFile) {
      return NextResponse.json({ error: "Arquivo de origem não encontrado." }, { status: 404 });
    }

    const sourceTone = normalizeTone(sourceFile.tone);

    if (!sourceTone) {
      return NextResponse.json({ error: "Tom de origem inválido." }, { status: 400 });
    }

    const kitSlug = sourceFile.kits?.slug ?? sourceFile.kit_id;

    const jobs = [];

    for (const targetTone of targetTones) {
      if (targetTone === sourceTone) continue;

      const shift = getSignedSemitoneDistance(sourceTone, targetTone);

      if (shift === null || shift === 0) continue;

      jobs.push({
        kit_id: sourceFile.kit_id,
        source_audio_file_id: sourceFile.id,
        voice: requestedVoice,
        source_tone: sourceTone,
        target_tone: targetTone,
        semitone_shift: shift,
        source_r2_key: sourceFile.r2_key,
        target_r2_key: buildTargetR2Key({
          kitSlug,
          voice: requestedVoice,
          targetTone,
        }),
        output_file_type: "mp3",
        status: "pending",
      });
    }

    if (jobs.length === 0) {
      return NextResponse.json({
        createdCount: 0,
        jobs: [],
      });
    }

    const { data: createdJobs, error: insertError } = await supabase
      .from("audio_generation_jobs")
      .upsert(jobs, {
        onConflict: "kit_id,voice,target_tone,source_audio_file_id",
        ignoreDuplicates: true,
      })
      .select("*");

    if (insertError) throw new Error(insertError.message);

    return NextResponse.json({
      createdCount: createdJobs?.length ?? 0,
      jobs: createdJobs ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
