import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { downloadFromR2, uploadVideoToR2 } from "./r2";

export type DuetRenderJob = {
  id: string;
  video_r2_key: string;
  voice_r2_key: string;
  reference_url: string;
  output_r2_key: string;
  voice_volume: number | null;
  reference_volume: number | null;
  reference_offset_ms: number | null;
};

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

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    console.info(`[duet-render] running ${command} ${args.join(" ")}`);
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed: ${code}`));
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

export async function renderDuetJob(job: DuetRenderJob) {
  const base = join(tmpdir(), `duet-render-${job.id}`);
  const inputVideo = `${base}-visual.mp4`;
  const inputVoice = `${base}-voice.m4a`;
  const outputVideo = `${base}-final.mp4`;

  try {
    console.info("[duet-render] processing job", { id: job.id, output: job.output_r2_key });
    await downloadFromR2(job.video_r2_key, inputVideo);
    await downloadFromR2(job.voice_r2_key, inputVoice);

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
    await uploadVideoToR2(job.output_r2_key, bytes);
    console.info("[duet-render] completed job", { id: job.id, bytes: bytes.length });
    return { bytes: bytes.length };
  } finally {
    await Promise.allSettled([unlink(inputVideo), unlink(inputVoice), unlink(outputVideo)]);
  }
}
