import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const enabled = String(process.env.ENABLE_DUET_RENDER_JOBS ?? "false").toLowerCase() === "true";
const hubSupabaseUrl = process.env.HUB_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const hubSupabaseServiceRoleKey = process.env.HUB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const duetBucket = process.env.HUB_DUET_RENDER_BUCKET || "submission-media";
const processOnlyNewJobs = String(process.env.PROCESS_ONLY_NEW_DUET_JOBS ?? "true").toLowerCase() === "true";
const workerStartIso = new Date().toISOString();

let hubSupabase: SupabaseClient | null = null;

export type DuetRenderJob = {
  id: string;
  source_video_url: string;
  source_voice_url: string;
  reference_url: string;
  output_path: string;
  voice_volume: number | null;
  reference_volume: number | null;
  reference_offset_ms: number | null;
  attempts: number | null;
};

function getHubSupabase() {
  if (!enabled) return null;
  if (!hubSupabaseUrl || !hubSupabaseServiceRoleKey) {
    console.warn("[duet-render] disabled: missing HUB_SUPABASE_URL/HUB_SUPABASE_SERVICE_ROLE_KEY");
    return null;
  }
  if (!hubSupabase) {
    hubSupabase = createClient(hubSupabaseUrl, hubSupabaseServiceRoleKey, { auth: { persistSession: false } });
  }
  return hubSupabase;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function gainFromPercent(percent: unknown, preGain: number) {
  return clamp((numberValue(percent, 0) / 100) * preGain, 0, 6);
}

async function downloadUrl(url: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`download_failed:${response.status}:${url.slice(0, 100)}`);
  await pipeline(response.body as unknown as NodeJS.ReadableStream, createWriteStream(outputPath));
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    console.info(`[duet-render] running ${command}`, { args });
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed:${code}`));
    });
  });
}

function buildFilter(job: DuetRenderJob) {
  const voiceGain = gainFromPercent(job.voice_volume ?? 100, 3.2);
  const referenceGain = gainFromPercent(job.reference_volume ?? 70, 0.08);
  const offsetMs = clamp(numberValue(job.reference_offset_ms, 0), -3000, 3000);
  const voiceDelay = Math.max(0, -offsetMs);
  const referenceDelay = Math.max(0, offsetMs);
  const voiceDelayFilter = voiceDelay ? `,adelay=${voiceDelay}:all=1` : "";
  const referenceDelayFilter = referenceDelay ? `,adelay=${referenceDelay}:all=1` : "";

  return [
    `[1:a]aresample=48000,volume=${voiceGain.toFixed(6)}${voiceDelayFilter}[voice]`,
    `[2:a]aresample=48000,volume=${referenceGain.toFixed(6)}${referenceDelayFilter}[ref]`,
    "[voice][ref]amix=inputs=2:duration=longest:dropout_transition=0,acompressor=threshold=-18dB:ratio=2.5:attack=8:release=160,alimiter=limit=0.95[aout]",
  ].join(";");
}

export async function reserveDuetRenderJob() {
  const supabase = getHubSupabase();
  if (!supabase) return null;

  let query = supabase
    .from("duet_render_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (processOnlyNewJobs) query = query.gte("created_at", workerStartIso);

  const { data: pending, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!pending) return null;

  const { data: locked, error: lockError } = await supabase
    .from("duet_render_jobs")
    .update({ status: "processing", started_at: new Date().toISOString(), attempts: Number(pending.attempts ?? 0) + 1 })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (lockError) throw new Error(lockError.message);
  return (locked ?? null) as DuetRenderJob | null;
}

export async function processDuetRenderJob(job: DuetRenderJob) {
  const supabase = getHubSupabase();
  if (!supabase) return;

  const base = join(tmpdir(), `duet-render-${job.id}`);
  const inputVideo = `${base}-visual.mp4`;
  const inputVoice = `${base}-voice.m4a`;
  const outputVideo = `${base}-final.mp4`;
  const started = Date.now();

  try {
    if (!job.source_video_url || !job.source_voice_url || !job.reference_url || !job.output_path) {
      throw new Error("duet_job_missing_required_fields");
    }

    console.info("[duet-render] processing job", { id: job.id, output: job.output_path });
    await downloadUrl(job.source_video_url, inputVideo);
    await downloadUrl(job.source_voice_url, inputVoice);

    await runCommand("ffmpeg", [
      "-hide_banner",
      "-y",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto",
      "-i",
      inputVideo,
      "-i",
      inputVoice,
      "-i",
      job.reference_url,
      "-filter_complex",
      buildFilter(job),
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-profile:v",
      "main",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-shortest",
      outputVideo,
    ]);

    const bytes = await readFile(outputVideo);
    if (bytes.byteLength < 1000) throw new Error(`empty_render_output:${bytes.byteLength}`);

    const uploaded = await supabase.storage.from(duetBucket).upload(job.output_path, bytes, { contentType: "video/mp4", upsert: true });
    if (uploaded.error) throw new Error(uploaded.error.message);

    const publicUrl = supabase.storage.from(duetBucket).getPublicUrl(job.output_path).data.publicUrl;
    const { error: updateError } = await supabase
      .from("duet_render_jobs")
      .update({
        status: "completed",
        output_url: publicUrl,
        completed_at: new Date().toISOString(),
        error_message: null,
        render_meta: {
          mode: "audio_generator_worker",
          bytes: bytes.byteLength,
          processing_ms: Date.now() - started,
        },
      })
      .eq("id", job.id);

    if (updateError) throw new Error(updateError.message);
    console.info("[duet-render] completed job", { id: job.id, bytes: bytes.byteLength, ms: Date.now() - started });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("duet_render_jobs").update({ status: "failed", error_message: message }).eq("id", job.id);
    console.error("[duet-render] job failed", { id: job.id, message });
  } finally {
    await Promise.allSettled([unlink(inputVideo), unlink(inputVoice), unlink(outputVideo)]);
  }
}
