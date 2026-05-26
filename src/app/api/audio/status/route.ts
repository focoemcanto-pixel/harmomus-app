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

async function reconcileCompletedJobs(supabase: ReturnType<typeof createSupabaseAdminClient>, kitId: string) {
  const { data: completedJobs, error } = await supabase
    .from("audio_generation_jobs")
    .select("id,kit_id,generated_audio_file_id,voice,target_tone,target_r2_key,status,output_file_type")
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

    let audioFileId = existing?.id as string | undefined;

    if (!audioFileId) {
      const { data: inserted, error: insertError } = await supabase
        .from("kit_audio_files")
        .insert({
          kit_id: kitId,
          tone: job.target_tone,
          name: canonicalVoiceName(job.voice),
          r2_key: job.target_r2_key,
          public_url: buildPublicUrl(job.target_r2_key),
          file_type: String(job.output_file_type ?? "mp3").replace(/^\./, "") || "mp3",
        })
        .select("id")
        .maybeSingle();

      if (insertError) throw new Error(insertError.message);
      audioFileId = inserted?.id as string | undefined;
      repaired += 1;
    }

    if (audioFileId && job.generated_audio_file_id !== audioFileId) {
      const { error: updateError } = await supabase
        .from("audio_generation_jobs")
        .update({ generated_audio_file_id: audioFileId })
        .eq("id", job.id);

      if (updateError) throw new Error(updateError.message);
    }
  }

  return repaired;
}

async function listJobs(supabase: ReturnType<typeof createSupabaseAdminClient>, kitId: string) {
  return supabase
    .from("audio_generation_jobs")
    .select("id,status,voice,source_tone,target_tone,semitone_shift,source_r2_key,target_r2_key,error_message,created_at,started_at,completed_at,updated_at,generated_audio_file_id")
    .eq("kit_id", kitId)
    .order("created_at", { ascending: false })
    .limit(200);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const kitId = searchParams.get("kitId");

  const supabase = createSupabaseAdminClient();

  if (!jobId && !kitId) {
    return NextResponse.json({ error: "jobId ou kitId é obrigatório." }, { status: 400 });
  }

  if (jobId) {
    const { data, error } = await supabase.from("audio_generation_jobs").select("*").eq("id", jobId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ job: data });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobs: data ?? [], repaired, repairError });
}
