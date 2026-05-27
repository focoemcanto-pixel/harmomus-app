import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { collectAudioMetrics, isolateAudioPitchShift, mp3ToWav, wavToMp3 } from "./generate-audio";
import { downloadFromR2, uploadToR2 } from "./r2";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const processOnlyNewJobs = String(process.env.PROCESS_ONLY_NEW_JOBS ?? "true").toLowerCase() === "true";
const workerStartIso = new Date().toISOString();

function canonicalVoiceName(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (normalized.includes("soprano")) return "Soprano";
  if (normalized.includes("contralto")) return "Contralto";
  if (normalized.includes("tenor")) return "Tenor";
  return "Todos";
}

async function reserveJob() {
  let query = supabase
    .from("audio_generation_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (processOnlyNewJobs) {
    query = query.gte("created_at", workerStartIso);
  }

  const { data: pending, error } = await query.maybeSingle();

  if (error) throw new Error(error.message);
  if (!pending) return null;

  const { data: locked, error: lockError } = await supabase
    .from("audio_generation_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      attempts: Number(pending.attempts ?? 0) + 1,
    })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (lockError) throw new Error(lockError.message);
  return locked ?? null;
}

async function upsertGeneratedAudioFile(job: any) {
  const voice = canonicalVoiceName(job.voice);
  const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const cleanKey = String(job.target_r2_key ?? "").replace(/^\/+/, "");
  const publicUrl = publicBaseUrl ? `${publicBaseUrl}/${cleanKey}` : null;

  const { data, error } = await supabase
    .from("kit_audio_files")
    .upsert(
      {
        kit_id: job.kit_id,
        tone: job.target_tone,
        name: voice,
        r2_key: job.target_r2_key,
        public_url: publicUrl,
        file_type: "mp3",
        source_type: "generated",
      },
      { onConflict: "kit_id,r2_key" },
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function processJob(job: any) {
  const base = join(tmpdir(), `audio-job-${job.id}`);
  const inputMp3 = `${base}-input.mp3`;
  const inputWav = `${base}-input.wav`;
  const shiftedWav = `${base}-shifted.wav`;
  const outputMp3 = `${base}-output.mp3`;

  try {
    const jobStart = Date.now();
    console.info(`[audio-generator] Processing job ${job.id}: ${job.voice} ${job.source_tone} -> ${job.target_tone}`);

    if (Math.abs(Number(job.semitone_shift)) > 2) {
      throw new Error(`Rejected shift outside ±2 semitones: ${job.semitone_shift}`);
    }

    await downloadFromR2(job.source_r2_key, inputMp3);
    console.info("[audio-generator] separando áudio");

    const beforeMetrics = await collectAudioMetrics(inputMp3);
    const decodeStart = Date.now();
    await mp3ToWav(inputMp3, inputWav);
    const decodeMs = Date.now() - decodeStart;

    const rubberbandStart = Date.now();
    const pitchShift = await isolateAudioPitchShift(inputWav, shiftedWav, Number(job.semitone_shift));
    const rubberbandMs = Date.now() - rubberbandStart;

    console.info("[audio-generator] exportando mp3");
    const encodeStart = Date.now();
    await wavToMp3(shiftedWav, outputMp3);
    const encodeMs = Date.now() - encodeStart;

    const outputBytes = await readFile(outputMp3);
    const afterMetrics = await collectAudioMetrics(outputMp3);
    console.info("[audio-generator] upload R2");
    await uploadToR2(job.target_r2_key, outputBytes);

    const audioFile = await upsertGeneratedAudioFile(job);

    const { error: updateError } = await supabase
      .from("audio_generation_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: null,
        processing_method: pitchShift.method,
        processing_ms: rubberbandMs,
        processing_logs: [...pitchShift.logs, "exportando mp3", "upload R2", "concluído"].join(" | "),
      })
      .eq("id", job.id);

    if (updateError) throw new Error(updateError.message);

    const totalMs = Date.now() - jobStart;
    console.info("[audio-generator] Completed job", {
      jobId: job.id,
      audioFileId: audioFile.id,
      decodeMs,
      rubberbandMs,
      processingMethod: pitchShift.method,
      encodeMs,
      totalMs,
      beforeMetrics,
      afterMetrics,
    });
    console.info("[audio-generator] concluído");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await supabase
      .from("audio_generation_jobs")
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("id", job.id);

    console.error(`[audio-generator] Job ${job.id} failed`, error);
  } finally {
    await Promise.allSettled([
      unlink(inputMp3),
      unlink(inputWav),
      unlink(shiftedWav),
      unlink(outputMp3),
    ]);
  }
}

async function main() {
  console.info("[audio-generator] Worker started");

  while (true) {
    try {
      const job = await reserveJob();

      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      await processJob(job);
    } catch (error) {
      console.error("[audio-generator] Fatal error", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((error) => {
  console.error("[audio-generator] Unhandled fatal error", error);
  process.exit(1);
});
