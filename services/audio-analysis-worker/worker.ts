import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { downloadFromR2 } from "./r2";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HEARTBEAT_INTERVAL_MS = 15 * 1000;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const ANALYSIS_MAX_SECONDS = Number(process.env.ANALYSIS_MAX_SECONDS ?? "30");
const ANALYSIS_SAMPLE_RATE = Number(process.env.ANALYSIS_SAMPLE_RATE ?? "16000");
const PYIN_TIMEOUT_MS = Number(process.env.PYIN_TIMEOUT_SECONDS ?? "45") * 1000;
const YIN_TIMEOUT_MS = Number(process.env.YIN_TIMEOUT_SECONDS ?? "20") * 1000;
const ENABLE_PYIN_ANALYSIS = String(process.env.ENABLE_PYIN_ANALYSIS ?? "false").toLowerCase() === "true";
const FFMPEG_TIMEOUT_MS = 30 * 1000;
const KILL_GRACE_MS = 2_000;
const MAX_CONCURRENT_ANALYSIS = Number(process.env.MAX_CONCURRENT_ANALYSIS ?? "1");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLE_SMART_TESSITURA_ANALYSIS = String(process.env.ENABLE_SMART_TESSITURA_ANALYSIS ?? "false").toLowerCase() === "true";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

function currentMemorySnapshot() {
  const toMb = (value: number) => Number((value / 1024 / 1024).toFixed(2));
  const mem = process.memoryUsage();
  return {
    rss_mb: toMb(mem.rss),
    heap_used_mb: toMb(mem.heapUsed),
    external_mb: toMb(mem.external),
  };
}

function midiToNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

async function reserveJob() {
  console.info("[audio-analysis-worker] reservando job");
  await enforceSingleProcessingJob();
  await recoverStaleProcessingJobs();

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

async function enforceSingleProcessingJob() {
  const { data: processingJobs, error } = await supabase
    .from("audio_analysis_jobs")
    .select("id,created_at,started_at")
    .eq("status", "processing")
    .order("started_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!processingJobs || processingJobs.length <= 1) return;

  const [keep, ...staleJobs] = processingJobs;
  const staleIds = staleJobs.map((job) => job.id);

  await supabase
    .from("audio_analysis_jobs")
    .update({
      status: "failed",
      error_message: `stale processing slot cleanup`,
      completed_at: new Date().toISOString(),
    })
    .in("id", staleIds)
    .eq("status", "processing");

  console.warn("[audio-analysis-worker] processamento concorrente detectado", {
    keep_job_id: keep.id,
    stale_job_ids: staleIds,
  });
}

async function recoverStaleProcessingJobs() {
  const staleThresholdIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

  await supabase
    .from("audio_analysis_jobs")
    .update({
      status: "pending",
      started_at: null,
      error_message: null,
    })
    .eq("status", "processing")
    .lt("started_at", staleThresholdIso);
}

async function killDescendants(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    execFile("bash", ["-lc", `pkill -9 -P ${pid} || true`], () => resolve());
  });
}

async function runSubprocess(command: string, args: string[], timeoutMs: number, timeoutLogLabel: string) {
  return await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const timeoutHandle = setTimeout(() => {
      console.error(`[audio-analysis-worker] timeout ${timeoutLogLabel}`, { pid: child.pid, timeout_ms: timeoutMs });
      if (child.pid) {
        void killDescendants(child.pid);
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      console.error("[audio-analysis-worker] subprocess stderr", {
        command,
        chunk: chunk.toString().slice(-1000),
      });
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      console.info("[audio-analysis-worker] subprocess finalizado", { command, exit_code: code, signal });

      if (code !== 0) {
        reject(new Error(`${command} exited with code ${String(code)} signal ${String(signal)} stderr: ${stderr.slice(-4000)}`));
        return;
      }

      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index] ?? null;
}

async function runLibrosaPitchAnalysis(sourcePath: string, mode: "pyin" | "yin") {
  const analysisMode = mode === "pyin" ? "librosa-pyin-direct" : "librosa-yin-fast";
  const timeoutMs = mode === "pyin" ? PYIN_TIMEOUT_MS : YIN_TIMEOUT_MS;

  console.info("[audio-analysis-worker] iniciando análise librosa", {
    analysis_mode: analysisMode,
    source: sourcePath,
    timeout_ms: timeoutMs,
  });

  const scriptPath = join(process.cwd(), "scripts", "analyze_pyin.py");
  const startedAt = Date.now();

  const { stdout } = await runSubprocess(
    "python",
    [scriptPath, sourcePath, mode],
    timeoutMs,
    `librosa-${mode}`,
  );

  const elapsedMs = Date.now() - startedAt;
  const payload = JSON.parse(stdout);

  console.info("[audio-analysis-worker] análise concluída", {
    analysis_mode: analysisMode,
    elapsed_ms: elapsedMs,
    voiced_frames: payload.voiced_frames,
  });

  return { ...payload, elapsedMs, analysisMode };
}

async function preprocessAudioWithFfmpeg(inputPath: string, outputPath: string) {
  await runSubprocess(
    "ffmpeg",
    ["-y", "-i", inputPath, "-ac", "1", "-ar", String(ANALYSIS_SAMPLE_RATE), "-t", String(ANALYSIS_MAX_SECONDS), outputPath],
    FFMPEG_TIMEOUT_MS,
    "ffmpeg-preprocess",
  );
}

function buildInsights(notes: Array<{ pitch_midi: number; confidence: number; start_s: number }>) {
  const midis = notes.map((n) => n.pitch_midi);

  const minMidi = percentile(midis, 0.05);
  const maxMidi = percentile(midis, 0.95);
  const comfortMin = percentile(midis, 0.2);
  const comfortMax = percentile(midis, 0.8);

  const dominant = [...new Set(midis)].slice(0, 7).map((midi) => ({
    midi,
    note: midiToNoteName(midi),
  }));

  const confidence = notes.length
    ? notes.reduce((sum, n) => sum + n.confidence, 0) / notes.length
    : 0;

  return {
    minMidi,
    maxMidi,
    comfortMin,
    comfortMax,
    dominant,
    confidence: Number(confidence.toFixed(4)),
  };
}

function normalizeVoice(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const DIRECT_VOICES = new Set(["soprano", "contralto", "tenor"]);
const IGNORED_ANALYSIS_LABELS = new Set(["todos", "mix", "completo"]);
