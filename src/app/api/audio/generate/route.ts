import { NextResponse } from "next/server";

import { CHROMATIC_TONES_SHARP, getSignedSemitoneDistance, normalizeTone, type CanonicalTone } from "@/lib/music/tones";
import { resolveGeneratedTone } from "@/lib/audio/resolve-generated-tone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const VALID_VOICES = new Set(["soprano", "contralto", "tenor", "todos"]);
const MAX_GENERATION_SHIFT = 2;

type SourceAudioFile = {
  id: string;
  kit_id: string;
  tone: string | null;
  r2_key: string;
  name: string | null;
  kits?: { slug?: string | null } | null;
};

type JobPayload = {
  kit_id: string;
  source_audio_file_id: string;
  voice: string;
  source_tone: string;
  target_tone: string;
  semitone_shift: number;
  source_r2_key: string;
  target_r2_key: string;
  output_file_type: string;
  status: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
};

function normalizeVoice(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized.includes("soprano")) return "soprano";
  if (normalized.includes("contralto")) return "contralto";
  if (normalized.includes("tenor")) return "tenor";
  if (normalized.includes("todos")) return "todos";
  return normalized;
}

function parseTargetTones(value: unknown): CanonicalTone[] {
  if (Array.isArray(value) && value.length > 0) {
    const tones = value
      .map((tone) => normalizeTone(String(tone ?? "")))
      .filter((tone): tone is CanonicalTone => Boolean(tone));
    return Array.from(new Set(tones));
  }

  return [...CHROMATIC_TONES_SHARP];
}

function fileMatchesVoice(file: SourceAudioFile, voice: string) {
  return normalizeVoice(file.name) === voice;
}

function normalizePathPart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9#-]/g, "");
}

function isGeneratedAudioFile(file: SourceAudioFile, kitSlug: string, voice: string) {
  const key = String(file.r2_key ?? "").trim().toLowerCase();
  const generatedPrefix = `kits/${normalizePathPart(kitSlug)}/${normalizePathPart(voice)}/`;
  return key.startsWith(generatedPrefix);
}

function pickNearestSource(sources: SourceAudioFile[], targetTone: CanonicalTone) {
  let best: { source: SourceAudioFile; sourceTone: CanonicalTone; shift: number; distance: number } | null = null;

  for (const source of sources) {
    const sourceTone = normalizeTone(source.tone);
    if (!sourceTone) continue;

    const shift = getSignedSemitoneDistance(sourceTone, targetTone);
    if (shift === null || shift === 0) continue;

    const distance = Math.abs(shift);
    if (distance > MAX_GENERATION_SHIFT) continue;

    if (!best || distance < best.distance) {
      best = { source, sourceTone, shift, distance };
    }
  }

  return best;
}

async function resetOrCreateJob(supabase: any, job: JobPayload) {
  const { data: existing, error: findError } = await supabase
    .from("audio_generation_jobs")
    .select("id")
    .eq("kit_id", job.kit_id)
    .eq("voice", job.voice)
    .eq("target_tone", job.target_tone)
    .eq("source_audio_file_id", job.source_audio_file_id)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  if (existing?.id) {
    const { data, error } = await supabase
      .from("audio_generation_jobs")
      .update(job)
      .eq("id", existing.id)
      .select("id,status,voice,source_tone,target_tone,semitone_shift,target_r2_key")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("audio_generation_jobs")
    .insert(job)
    .select("id,status,voice,source_tone,target_tone,semitone_shift,target_r2_key")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function POST(request: Request) {
  const supabase = createSupabaseAdminClient();
  const body = (await request.json().catch(() => ({}))) as {
    sourceAudioFileId?: string;
    targetTones?: string[];
    voice?: string;
    kitId?: string;
  };

  const sourceAudioFileId = String(body.sourceAudioFileId ?? "").trim();
  const voice = normalizeVoice(body.voice);
  const requestedTargetTones = parseTargetTones(body.targetTones);

  if (!sourceAudioFileId && !body.kitId) {
    return NextResponse.json({ error: "sourceAudioFileId ou kitId é obrigatório." }, { status: 400 });
  }

  if (!voice || !VALID_VOICES.has(voice)) {
    return NextResponse.json({ error: "voice inválido." }, { status: 400 });
  }

  let kitId = String(body.kitId ?? "").trim();
  let kitSlug: string | undefined;

  if (sourceAudioFileId) {
    const { data: sourceFile, error: sourceError } = await supabase
      .from("kit_audio_files")
      .select("id,kit_id,tone,r2_key,name,kits(slug)")
      .eq("id", sourceAudioFileId)
      .maybeSingle();

    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
    if (!sourceFile) return NextResponse.json({ error: "sourceAudioFileId não encontrado." }, { status: 404 });

    kitId = sourceFile.kit_id;
    kitSlug = (sourceFile as SourceAudioFile)?.kits?.slug ?? undefined;
  }

  const { data: kit, error: kitError } = await supabase
    .from("kits")
    .select("id,slug")
    .eq("id", kitId)
    .maybeSingle();

  if (kitError) return NextResponse.json({ error: kitError.message }, { status: 500 });
  if (!kit) return NextResponse.json({ error: "Kit não encontrado." }, { status: 404 });

  kitSlug = kitSlug ?? kit.slug;

  if (!kitSlug) {
    return NextResponse.json({ error: "Kit sem slug válido." }, { status: 400 });
  }

  const { data: allKitFiles, error: filesError } = await supabase
    .from("kit_audio_files")
    .select("id,kit_id,tone,r2_key,name")
    .eq("kit_id", kitId);

  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 });

  const voiceFiles = ((allKitFiles ?? []) as SourceAudioFile[]).filter((file) => fileMatchesVoice(file, voice));
  const existingTones = new Set(
    voiceFiles
      .map((file) => normalizeTone(file.tone))
      .filter((tone): tone is CanonicalTone => Boolean(tone)),
  );

  const originalSourceFiles = voiceFiles.filter(
    (file) => Boolean(file.r2_key) && Boolean(normalizeTone(file.tone)) && !isGeneratedAudioFile(file, kitSlug, voice),
  );

  if (originalSourceFiles.length === 0) {
    return NextResponse.json({ error: `Nenhum áudio original encontrado para ${voice}. Os arquivos gerados não podem ser usados como fonte para evitar perda de qualidade em cascata.` }, { status: 400 });
  }

  const jobsToProcess: JobPayload[] = [];
  const skipped: Array<{ tone: string; reason: string }> = [];

  for (const targetTone of requestedTargetTones) {
    if (existingTones.has(targetTone)) {
      skipped.push({ tone: targetTone, reason: "already-exists" });
      continue;
    }

    const best = pickNearestSource(originalSourceFiles, targetTone);

    if (!best) {
      skipped.push({ tone: targetTone, reason: "no-original-source-within-2-semitones" });
      continue;
    }

    const target = resolveGeneratedTone({ kitSlug, voice, tone: targetTone, extension: "mp3" });
    if (!target) {
      skipped.push({ tone: targetTone, reason: "invalid-target" });
      continue;
    }

    jobsToProcess.push({
      kit_id: kitId,
      source_audio_file_id: best.source.id,
      voice,
      source_tone: best.sourceTone,
      target_tone: targetTone,
      semitone_shift: best.shift,
      source_r2_key: best.source.r2_key,
      target_r2_key: target.key,
      output_file_type: "mp3",
      status: "pending",
      error_message: null,
      started_at: null,
      completed_at: null,
    });
  }

  if (jobsToProcess.length === 0) {
    return NextResponse.json({
      message: "Nenhum job novo criado. Só geramos até ±2 semitons a partir de áudios originais; adicione mais tons originais para ampliar a cobertura.",
      createdCount: 0,
      jobs: [],
      skipped,
    });
  }

  const jobs = [];

  try {
    for (const job of jobsToProcess) {
      const saved = await resetOrCreateJob(supabase, job);
      if (saved) jobs.push(saved);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enfileirar jobs.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    message: "Jobs enfileirados/reiniciados usando apenas áudios originais e limite de ±2 semitons por origem.",
    createdCount: jobs.length,
    jobs,
    skipped,
  });
}
