import { readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { downloadFromR2, uploadToR2 } from "./r2";
import { generateAudioWithRubberBand, mp3ToWav, wavToMp3 } from "./generate-audio";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const port = Number(process.env.PORT ?? 10000);

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.");
if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function startHealthServer() {
  createServer((request, response) => {
    if (request.url === "/healthz" || request.url === "/") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, service: "harmomus-audio-generator" }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  }).listen(port, "0.0.0.0", () => {
    console.info(`[audio-generator] Health server listening on :${port}`);
  });
}

async function reserveJob() {
  const { data, error } = await supabase
    .from("audio_generation_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: locked, error: lockError } = await supabase
    .from("audio_generation_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", data.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (lockError) throw new Error(lockError.message);
  return locked ?? null;
}

async function upsertGeneratedAudioFile(job: any, publicUrl: string | null) {
  const payload = {
    kit_id: job.kit_id,
    tone: job.target_tone,
    name: `${job.voice} - ${job.target_tone}`,
    r2_key: job.target_r2_key,
    public_url: publicUrl,
    file_type: "audio/mpeg",
  };

  const { data: existing, error: findError } = await supabase
    .from("kit_audio_files")
    .select("id")
    .eq("kit_id", job.kit_id)
    .eq("r2_key", job.target_r2_key)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  if (existing?.id) {
    const { error } = await supabase
      .from("kit_audio_files")
      .update(payload)
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("kit_audio_files")
    .insert(payload);

  if (error) throw new Error(error.message);
}

async function processJob(job: any) {
  const base = join(tmpdir(), `audio-job-${job.id}`);
  const inputMp3 = `${base}-input.mp3`;
  const inputWav = `${base}-input.wav`;
  const shiftedWav = `${base}-shifted.wav`;
  const outputMp3 = `${base}-output.mp3`;

  try {
    console.info(`[audio-generator] Processing job ${job.id}: ${job.voice} ${job.source_tone} -> ${job.target_tone}`);

    await downloadFromR2(job.source_r2_key, inputMp3);
    await mp3ToWav(inputMp3, inputWav);
    await generateAudioWithRubberBand(inputWav, shiftedWav, Number(job.semitone_shift));
    await wavToMp3(shiftedWav, outputMp3);

    const outputBytes = await readFile(outputMp3);
    await uploadToR2(job.target_r2_key, outputBytes);

    const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
    const publicUrl = publicBaseUrl ? `${publicBaseUrl}/${job.target_r2_key}` : null;

    await upsertGeneratedAudioFile(job, publicUrl);

    const { error: updateError } = await supabase
      .from("audio_generation_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", job.id);

    if (updateError) throw new Error(updateError.message);

    console.info(`[audio-generator] Completed job ${job.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error(`[audio-generator] Failed job ${job.id}: ${message}`);

    await supabase
      .from("audio_generation_jobs")
      .update({ status: "failed", error_message: message })
      .eq("id", job.id);
  } finally {
    await Promise.all([inputMp3, inputWav, shiftedWav, outputMp3].map((file) => rm(file, { force: true })));
  }
}

async function main() {
  startHealthServer();
  console.info("[audio-generator] Worker started");

  for (;;) {
    const job = await reserveJob();

    if (!job) {
      await sleep(3000);
      continue;
    }

    await processJob(job);
  }
}

void main().catch((error) => {
  console.error("[audio-generator] Fatal error", error);
  process.exit(1);
});
