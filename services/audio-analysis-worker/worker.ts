import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

import { downloadFromR2 } from "./r2";

const execFileAsync = promisify(execFile);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLE_SMART_TESSITURA_ANALYSIS = String(process.env.ENABLE_SMART_TESSITURA_ANALYSIS ?? "false").toLowerCase() === "true";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

async function reserveJob() {
  const { data: pending, error } = await supabase
    .from("audio_analysis_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!pending) return null;

  const { data: locked, error: lockError } = await supabase
    .from("audio_analysis_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
    })
    .eq("id", pending.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (lockError) throw new Error(lockError.message);
  return locked ?? null;
}

async function probeAudio(filePath: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  return JSON.parse(stdout || "{}");
}

async function processJob(job: any) {
  const sourcePath = join(tmpdir(), `analysis-${job.id}.source`);
  const logs: Array<Record<string, unknown>> = [];

  logs.push({ at: new Date().toISOString(), message: "FASE 2 worker iniciado" });
  logs.push({ at: new Date().toISOString(), message: "Preparado para Demucs/BasicPitch (integração futura)" });

  try {
    if (!job.source_r2_key) {
      throw new Error("Job sem source_r2_key.");
    }

    await downloadFromR2(job.source_r2_key, sourcePath);
    logs.push({ at: new Date().toISOString(), message: "Download do áudio concluído", source_r2_key: job.source_r2_key });

    const probe = await probeAudio(sourcePath);
    logs.push({ at: new Date().toISOString(), message: "ffprobe concluído", probe });

    const { error } = await supabase
      .from("audio_analysis_jobs")
      .update({
        status: "completed",
        analysis_method: "ffprobe-initial",
        detected_min_midi: null,
        detected_max_midi: null,
        analysis_logs: logs,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) throw new Error(error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logs.push({ at: new Date().toISOString(), message: "Falha no processamento", error: message });

    await supabase
      .from("audio_analysis_jobs")
      .update({
        status: "failed",
        error_message: message,
        analysis_logs: logs,
      })
      .eq("id", job.id);
  } finally {
    await Promise.allSettled([unlink(sourcePath)]);
  }
}

async function main() {
  console.info("[audio-analysis-worker] started", { ENABLE_SMART_TESSITURA_ANALYSIS });

  while (true) {
    try {
      if (!ENABLE_SMART_TESSITURA_ANALYSIS) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      const job = await reserveJob();
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }

      await processJob(job);
    } catch (error) {
      console.error("[audio-analysis-worker] fatal", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((error) => {
  console.error("[audio-analysis-worker] unhandled fatal", error);
  process.exit(1);
});
