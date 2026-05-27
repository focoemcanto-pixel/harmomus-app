import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AnalyzePayload = {
  kitId?: string;
  audioFileId?: string;
};

const ENABLE_SMART_TESSITURA_ANALYSIS = String(process.env.ENABLE_SMART_TESSITURA_ANALYSIS ?? "false").toLowerCase() === "true";

export async function POST(request: Request) {
  try {
    const current = await getCurrentUserAccessContext();

    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as AnalyzePayload;
    const kitId = String(body.kitId ?? "").trim();
    const audioFileId = String(body.audioFileId ?? "").trim();

    if (!kitId || !audioFileId) {
      return NextResponse.json({ error: "kitId e audioFileId são obrigatórios." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: audioFile, error: fileError } = await supabase
      .from("kit_audio_files")
      .select("id,kit_id,name,tone,r2_key")
      .eq("id", audioFileId)
      .eq("kit_id", kitId)
      .maybeSingle();

    if (fileError) {
      return NextResponse.json({ error: fileError.message }, { status: 500 });
    }

    if (!audioFile) {
      return NextResponse.json({ error: "kit_audio_file não encontrado para o kit informado." }, { status: 404 });
    }

    const { data: existingJob } = await supabase
      .from("audio_analysis_jobs")
      .select("id,status")
      .eq("kit_id", kitId)
      .eq("audio_file_id", audioFileId)
      .eq("analysis_type", "tessitura")
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJob?.id) {
      return NextResponse.json({ success: true, skipped: true, job: existingJob, autoAnalysisEnabled: ENABLE_SMART_TESSITURA_ANALYSIS }, { status: 200 });
    }

    const { data: job, error: jobError } = await supabase
      .from("audio_analysis_jobs")
      .insert({
        kit_id: kitId,
        audio_file_id: audioFileId,
        voice: audioFile.name ?? null,
        tone: audioFile.tone ?? null,
        status: "pending",
        analysis_type: "tessitura",
        source_r2_key: audioFile.r2_key ?? null,
        analysis_logs: [
          {
            message: "Job criado via endpoint manual /api/audio/analyze",
            at: new Date().toISOString(),
            autoEnabled: ENABLE_SMART_TESSITURA_ANALYSIS,
          },
        ],
      })
      .select("id,status,kit_id,audio_file_id,analysis_type,created_at")
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, autoAnalysisEnabled: ENABLE_SMART_TESSITURA_ANALYSIS, job }, { status: 200 });
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
      .select("id,status,kit_id,audio_file_id,analysis_type,analysis_logs,error_message,detected_min_note,detected_max_note,comfort_min_note,comfort_max_note,dominant_notes,vocal_confidence,pitch_events_json,created_at,updated_at")
      .eq("kit_id", kitId)
      .eq("analysis_type", "tessitura")
      .order("created_at", { ascending: false })
      .limit(100);

    if (audioFileId) query = query.eq("audio_file_id", audioFileId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobs: data ?? [] }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao listar jobs de análise.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
