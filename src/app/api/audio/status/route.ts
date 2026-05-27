import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function canonicalVoiceName(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized.includes("soprano")) return "soprano";
  if (normalized.includes("contralto")) return "contralto";
  if (normalized.includes("tenor")) return "tenor";
  return "todos";
}

function buildPublicUrl(r2Key: string) {
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return publicBaseUrl ? `${publicBaseUrl}/${r2Key}` : r2Key;
}

function normalizeStatus(value: string | null | undefined) {
  const raw = String(value ?? "").toLowerCase().trim();
  if (!raw) return "pending";
  if (["queued", "pending", "processing", "completed", "failed", "cancelled"].includes(raw)) {
    if (raw === "queued") return "pending";
    if (raw === "cancelled") return "failed";
    return raw;
  }
  return "pending";
}

function parseJobs(rawJobs: any[]) {
  return rawJobs.map((job) => ({
    id: String(job.id ?? ""),
    status: normalizeStatus(job.status),
    voice: job.voice ?? "todos",
    source_tone: job.source_tone ?? null,
    target_tone: job.target_tone ?? null,
    semitone_shift: typeof job.semitone_shift === "number" ? job.semitone_shift : null,
    source_r2_key: job.source_r2_key ?? null,
    target_r2_key: job.target_r2_key ?? null,
    error_message: job.error_message ?? null,
    created_at: job.created_at ?? null,
    started_at: job.started_at ?? null,
    completed_at: job.completed_at ?? null,
    updated_at: job.updated_at ?? null,
  }));
}

async function reconcileCompletedJobs(supabase: ReturnType<typeof createSupabaseAdminClient>, kitId: string) {
  const { data: completedJobs, error } = await supabase
    .from("audio_generation_jobs")
    .select("id,kit_id,voice,target_tone,target_r2_key,status,output_file_type")
    .eq("kit_id", kitId)
    .eq("status", "completed");

  if (error) throw new Error(error.message);

  let repaired = 0;

  for (const job of completedJobs ?? []) {
    if (!job.target_r2_key || !job.target_tone) continue;

    const { data: existing, error: findError } = await supabase
      .from("kit_audio_files")
      .select("id")
      .eq("kit_id", kitId)
      .eq("r2_key", job.target_r2_key)
      .maybeSingle();

    if (findError) throw new Error(findError.message);
    if (existing?.id) continue;

    const { error: insertError } = await supabase
      .from("kit_audio_files")
      .insert({
        kit_id: kitId,
        tone: job.target_tone,
        name: canonicalVoiceName(job.voice),
        r2_key: job.target_r2_key,
        public_url: buildPublicUrl(job.target_r2_key),
        file_type: String(job.output_file_type ?? "mp3").replace(/^\./, "") || "mp3",
      });

    if (insertError) throw new Error(insertError.message);
    repaired += 1;
  }

  return repaired;
}

async function listJobs(supabase: ReturnType<typeof createSupabaseAdminClient>, kitId: string) {
  return supabase
    .from("audio_generation_jobs")
    .select("id,status,voice,source_tone,target_tone,semitone_shift,source_r2_key,target_r2_key,error_message,created_at,started_at,completed_at,updated_at")
    .eq("kit_id", kitId)
    .order("updated_at", { ascending: false })
    .limit(500);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("jobId");
    const kitId = searchParams.get("kitId");

    const supabase = createSupabaseAdminClient();

    if (!jobId && !kitId) {
      return NextResponse.json({ success: false, error: "jobId ou kitId é obrigatório.", jobs: [] }, { status: 200 });
    }

    if (jobId) {
      const { data, error } = await supabase
        .from("audio_generation_jobs")
        .select("id,status,voice,source_tone,target_tone,semitone_shift,source_r2_key,target_r2_key,error_message,created_at,started_at,completed_at,updated_at")
        .eq("id", jobId)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ success: true, jobs: [], error: error.message }, { status: 200 });
      }

      return NextResponse.json({ success: true, jobs: data ? parseJobs([data]) : [] }, { status: 200 });
    }

    let repaired = 0;
    let repairError: string | null = null;

    try {
      repaired = await reconcileCompletedJobs(supabase, kitId!);
    } catch (error) {
      repairError = error instanceof Error ? error.message : "Falha ao reparar jobs concluídos.";
      console.error("[audio-status] reconcile failed", error);
    }

    const { data, error } = await listJobs(supabase, kitId!);

    if (error) {
      console.error("[audio-status] listJobs failed", error);
      return NextResponse.json({ success: true, jobs: [], repaired, repairError, error: error.message }, { status: 200 });
    }

    const jobs = parseJobs(data ?? []);

    return NextResponse.json({ success: true, jobs, repaired, repairError }, { status: 200 });
  } catch (error) {
    console.error("[audio-status]", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        jobs: [],
      },
      { status: 200 },
    );
  }
}
