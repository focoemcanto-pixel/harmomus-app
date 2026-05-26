import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { downloadFromR2, uploadToR2 } from "./r2";
import { generateAudioWithRubberBand, wavToMp3 } from "./generate-audio";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function reserveJob() {
  const { data } = await supabase.from("audio_generation_jobs").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!data) return null;
  const { data: locked } = await supabase
    .from("audio_generation_jobs")
    .update({ status: "processing", started_at: new Date().toISOString(), attempts: (data.attempts ?? 0) + 1 })
    .eq("id", data.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  return locked ?? null;
}

async function processJob(job: any) {
  const base = join(tmpdir(), `audio-job-${job.id}`);
  const inputMp3 = `${base}-input.mp3`;
  const inputWav = `${base}-input.wav`;
  const shiftedWav = `${base}-shifted.wav`;
  const outputMp3 = `${base}-output.mp3`;

  try {
    await downloadFromR2(job.source_r2_key, inputMp3);
    await wavToMp3(inputMp3, inputWav);
    await generateAudioWithRubberBand(inputWav, shiftedWav, job.semitone_shift);
    await wavToMp3(shiftedWav, outputMp3);

    const outputBytes = await readFile(outputMp3);
    await uploadToR2(job.target_r2_key, outputBytes);

    const publicUrl = `${(process.env.R2_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}/${job.target_r2_key}`;
    const { data: file } = await supabase
      .from("kit_audio_files")
      .insert({ kit_id: job.kit_id, tone: job.target_tone, name: `${job.voice} - ${job.target_tone}`, r2_key: job.target_r2_key, public_url: publicUrl, file_type: "audio/mpeg" })
      .select("id")
      .maybeSingle();

    await supabase.from("audio_generation_jobs").update({ status: "completed", generated_audio_file_id: file?.id ?? null, completed_at: new Date().toISOString(), error_message: null }).eq("id", job.id);
  } catch (error) {
    await supabase.from("audio_generation_jobs").update({ status: "failed", error_message: error instanceof Error ? error.message : "Erro desconhecido" }).eq("id", job.id);
  } finally {
    await Promise.all([inputMp3, inputWav, shiftedWav, outputMp3].map((f) => rm(f, { force: true })));
  }
}

async function main() {
  for (;;) {
    const job = await reserveJob();
    if (!job) {
      await sleep(3000);
      continue;
    }
    await processJob(job);
  }
}

void main();
