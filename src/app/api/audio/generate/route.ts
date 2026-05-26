import { NextResponse } from "next/server";

import { normalizeTone, getSignedSemitoneDistance } from "@/lib/music/tones";
import { resolveGeneratedTone } from "@/lib/audio/resolve-generated-tone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const VALID_VOICES = new Set(["soprano", "contralto", "tenor", "todos"]);

export async function POST(request: Request) {
  const supabase = createSupabaseAdminClient();
  const body = (await request.json().catch(() => ({}))) as {
    sourceAudioFileId?: string;
    targetTones?: string[];
    voice?: string;
  };

  const sourceAudioFileId = String(body.sourceAudioFileId ?? "").trim();
  const targetTones = Array.isArray(body.targetTones) ? body.targetTones : [];
  const voice = String(body.voice ?? "").trim().toLowerCase();

  if (!sourceAudioFileId || targetTones.length === 0 || !voice) {
    return NextResponse.json({ error: "sourceAudioFileId, targetTones[] e voice são obrigatórios." }, { status: 400 });
  }
  if (!VALID_VOICES.has(voice)) return NextResponse.json({ error: "voice inválido." }, { status: 400 });

  const { data: sourceFile, error: sourceError } = await supabase
    .from("kit_audio_files")
    .select("id,kit_id,tone,r2_key,name,kits(slug)")
    .eq("id", sourceAudioFileId)
    .maybeSingle();

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!sourceFile) return NextResponse.json({ error: "sourceAudioFileId não encontrado." }, { status: 404 });

  const sourceTone = normalizeTone(sourceFile.tone);
  const kitSlug = (sourceFile as any)?.kits?.slug as string | undefined;
  if (!sourceTone || !kitSlug) return NextResponse.json({ error: "Arquivo de origem inválido (tom/kit)." }, { status: 400 });

  const normalizedTargets = [...new Set(targetTones.map((t) => normalizeTone(t)).filter(Boolean))] as string[];
  const jobsToInsert = normalizedTargets
    .map((targetTone) => {
      const semitoneShift = getSignedSemitoneDistance(sourceTone, targetTone);
      const target = resolveGeneratedTone({ kitSlug, voice, tone: targetTone, extension: "mp3" });
      if (semitoneShift === null || !target) return null;
      return {
        kit_id: sourceFile.kit_id,
        source_audio_file_id: sourceFile.id,
        voice,
        source_tone: sourceTone,
        target_tone: targetTone,
        semitone_shift: semitoneShift,
        source_r2_key: sourceFile.r2_key,
        target_r2_key: target.key,
        output_file_type: "mp3",
        status: "pending",
      };
    })
    .filter(Boolean);

  if (jobsToInsert.length === 0) return NextResponse.json({ error: "Nenhum targetTone válido para enfileirar." }, { status: 400 });

  const { data, error } = await supabase
    .from("audio_generation_jobs")
    .upsert(jobsToInsert as never[], { onConflict: "kit_id,voice,target_tone,source_audio_file_id", ignoreDuplicates: true })
    .select("id,status,target_tone,semitone_shift,target_r2_key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Jobs enfileirados com sucesso.", jobs: data ?? [] });
}
