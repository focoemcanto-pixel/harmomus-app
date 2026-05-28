import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AnalyzePayload = {
  kitId?: string;
  audioFileId?: string;
};

type BatchError = {
  audioFileId: string;
  message: string;
};

type ExistingAnalysisJob = {
  id: string;
  audio_file_id: string;
  status: string;
  detected_min_midi?: number | null;
  detected_max_midi?: number | null;
  comfort_min_midi?: number | null;
  comfort_max_midi?: number | null;
  detected_min_note?: number | null;
  detected_max_note?: number | null;
  comfort_min_note?: number | null;
  comfort_max_note?: number | null;
};

const ENABLE_SMART_TESSITURA_ANALYSIS = String(process.env.ENABLE_SMART_TESSITURA_ANALYSIS ?? "false").toLowerCase() === "true";
const VOICES = ["soprano", "contralto", "tenor"] as const;

function hasCompleteAnalysis(job: ExistingAnalysisJob) {
  const detectedMin = job.detected_min_note ?? job.detected_min_midi;
  const detectedMax = job.detected_max_note ?? job.detected_max_midi;
  const comfortMin = job.comfort_min_note ?? job.comfort_min_midi;
  const comfortMax = job.comfort_max_note ?? job.comfort_max_midi;

  return [detectedMin, detectedMax, comfortMin, comfortMax].every((value) => typeof value === "number");
}

function deriveVoice(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const match = VOICES.find((voice) => normalized.includes(voice));
  return match ?? null;
}

export async function POST(request: Request) {
  try {
    const current = await getCurrentUserAccessContext();

    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as AnalyzePayload;
    const kitId = String(body.kitId ?? "").trim();
    const audioFileId = String(body.audioFileId ?? "").trim();

    if (!kitId) {
      return NextResponse.json({ error: "kitId é obrigatório." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: files, error: filesError } = await supabase
      .from("kit_audio_files")
      .select("id,kit_id,name,tone,r2_key")
      .eq("kit_id", kitId)
      .order("created_at", { ascending: true });

    if (filesError) {
      return NextResponse.json({ error: filesError.message }, { status: 500 });
    }

    const targetFiles = (files ?? []).filter((file) => (audioFileId ? file.id === audioFileId : true));

    if (targetFiles.length === 0) {
      return NextResponse.json({ error: audioFileId ? "kit_audio_file não encontrado para o kit informado." : "Nenhum arquivo encontrado para o kit informado." }, { status: 404 });
    }

    const fileIds = targetFiles.map((file) => file.id);
    const { data: existingJobs, error: existingJobsError } = await supabase
      .from("audio_analysis_jobs")
      .select("id,audio_file_id,status,detected_min_midi,detected_max_midi,comfort_min_midi,comfort_max_midi,detected_min_note,detected_max_note,comfort_min_note,comfort_max_note")
      .eq("kit_id", kitId)
      .eq("analysis_type", "tessitura")
      .in("audio_file_id", fileIds)
      .in("status", ["pending", "processing", "completed"]);

    if (existingJobsError) {
      return NextResponse.json({ error: existingJobsError.message }, { status: 500 });
    }

    const existingByFileId = new Map((existingJobs ?? []).map((job) => [String(job.audio_file_id), job as ExistingAnalysisJob]));
    const incompleteCompletedJobs = (existingJobs ?? []).filter((job) => job.status === "completed" && !hasCompleteAnalysis(job as ExistingAnalysisJob));

    if (incompleteCompletedJobs.length > 0) {
      const { error: resetError } = await supabase
        .from("audio_analysis_jobs")
        .update({
          status: "pending",
          error_message: null,
          analysis_logs: [{ message: "Job reenfileirado: análise completed sem min/max/comfort preenchidos", at: new Date().toISOString() }],
          started_at: null,
          completed_at: null,
        })
        .in("id", incompleteCompletedJobs.map((job) => job.id));

      if (resetError) {
        return NextResponse.json({ error: resetError.message }, { status: 500 });
      }
    }

    const jobsToInsert = targetFiles
      .filter((file) => !existingByFileId.has(String(file.id)))
      .flatMap((file) => {
        const voice = deriveVoice(file.name);
        if (!voice) return [];
        return [
          {
            kit_id: kitId,
            audio_file_id: file.id,
            voice,
            tone: file.tone ?? null,
            status: "pending",
            analysis_type: "tessitura",
            source_r2_key: file.r2_key ?? null,
            analysis_logs: [
              {
                message: "Job criado via endpoint manual /api/audio/analyze",
                at: new Date().toISOString(),
                autoEnabled: ENABLE_SMART_TESSITURA_ANALYSIS,
              },
            ],
          },
        ];
      });

    let createdCount = 0;
    const errors: BatchError[] = [];

    if (jobsToInsert.length > 0) {
      const { data: createdRows, error: insertError } = await supabase
        .from("audio_analysis_jobs")
        .insert(jobsToInsert)
        .select("id");

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      createdCount = createdRows?.length ?? jobsToInsert.length;
    }

    return NextResponse.json(
      {
        success: true,
        autoAnalysisEnabled: ENABLE_SMART_TESSITURA_ANALYSIS,
        createdCount,
        skippedCount: Math.max(0, targetFiles.length - createdCount - incompleteCompletedJobs.length),
        requeuedIncompleteCount: incompleteCompletedJobs.length,
        skipped: createdCount === 0 && incompleteCompletedJobs.length === 0,
        errors,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao criar job de análise.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const current = await getCurrentUserAccessContext();
    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const kitId = String(searchParams.get("kitId") ?? "").trim();
    const audioFileId = String(searchParams.get("audioFileId") ?? "").trim();

    if (!kitId) {
      return NextResponse.json({ error: "kitId é obrigatório." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("audio_analysis_jobs")
      .select("id,status,kit_id,audio_file_id,voice,tone,analysis_type,analysis_logs,error_message,analysis_method,detected_min_midi,detected_max_midi,comfort_min_midi,comfort_max_midi,detected_min_note,detected_max_note,comfort_min_note,comfort_max_note,dominant_notes,recommended_tones,vocal_confidence,pitch_events_json,created_at,updated_at,completed_at")
      .eq("kit_id", kitId)
      .eq("analysis_type", "tessitura")
      .order("created_at", { ascending: false })
      .limit(100);

    if (audioFileId) query = query.eq("audio_file_id", audioFileId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const jobs = (data ?? []).map((job) => ({
      ...job,
      detected_min_note: job.detected_min_note ?? job.detected_min_midi ?? null,
      detected_max_note: job.detected_max_note ?? job.detected_max_midi ?? null,
      comfort_min_note: job.comfort_min_note ?? job.comfort_min_midi ?? null,
      comfort_max_note: job.comfort_max_note ?? job.comfort_max_midi ?? null,
    }));

    return NextResponse.json({ success: true, jobs }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao listar jobs de análise.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
