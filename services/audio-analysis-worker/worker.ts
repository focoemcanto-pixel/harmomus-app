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
  const staleReason = `stale processing slot cleanup: kept ${keep.id} and failed ${staleIds.length} older processing job(s)`;

  const { error: failError } = await supabase
    .from("audio_analysis_jobs")
    .update({
      status: "failed",
      error_message: staleReason,
      completed_at: new Date().toISOString(),
    })
    .in("id", staleIds)
    .eq("status", "processing");

  if (failError) throw new Error(failError.message);
  console.warn("[audio-analysis-worker] processamento concorrente detectado; jobs antigos marcados como stale", {
    keep_job_id: keep.id,
    stale_job_ids: staleIds,
  });
}

async function recoverStaleProcessingJobs() {
  const staleThresholdIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const recoveredAt = new Date().toISOString();

  const { data: recoveredJobs, error: recoverError } = await supabase
    .from("audio_analysis_jobs")
    .update({
      status: "pending",
      started_at: null,
      error_message: null,
    })
    .eq("status", "processing")
    .lt("started_at", staleThresholdIso)
    .select("id, started_at");

  if (recoverError) throw new Error(recoverError.message);
  if (!recoveredJobs?.length) return;

  for (const recoveredJob of recoveredJobs) {
    console.warn("[audio-analysis-worker] stale job recovered", {
      job_id: recoveredJob.id,
      recovered_at: recoveredAt,
      previous_started_at: recoveredJob.started_at,
    });
  }
}

async function killDescendants(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    execFile("bash", ["-lc", `pkill -9 -P ${pid} || true`], () => resolve());
  });
}

async function runSubprocess(command: string, args: string[], timeoutMs: number, timeoutLogLabel: string, extraEnv?: Record<string, string>) {
  return await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(command, args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    });

    const rejectTimeout = () => {
      if (settled) return;
      settled = true;
      reject(new Error(`timeout ${timeoutLogLabel}: processo excedeu ${timeoutMs}ms`));
    };

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      console.error(`[audio-analysis-worker] timeout ${timeoutLogLabel}`, { pid: child.pid, timeout_ms: timeoutMs });
      if (child.pid) {
        void killDescendants(child.pid);
        try {
          process.kill(-child.pid, "SIGKILL");
          console.warn("[audio-analysis-worker] processo morto", { pid: child.pid, tree: true, signal: "SIGKILL" });
        } catch {
          try {
            child.kill("SIGKILL");
            console.warn("[audio-analysis-worker] processo morto", { pid: child.pid, tree: false, signal: "SIGKILL" });
          } catch {
            // noop
          }
        }
      }
      setTimeout(rejectTimeout, KILL_GRACE_MS);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString();
      stdout += text;
      console.info("[audio-analysis-worker] subprocess stdout", { command, chunk: text.slice(-1000) });
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString();
      stderr += text;
      console.error("[audio-analysis-worker] subprocess stderr", { command, chunk: text.slice(-1000) });
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      console.info("[audio-analysis-worker] subprocess finalizado", { command, exit_code: code, signal });
      if (timedOut) return;
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
  const analysisMode = mode === "pyin" ? "librosa-pyin-direct" : "librosa-yin-fast-fallback";
  console.info("[audio-analysis-worker] iniciando análise librosa", { analysis_mode: analysisMode, source: sourcePath });
  const scriptPath = join(process.cwd(), "scripts", "analyze_pyin.py");
  const startedAt = Date.now();
  const timeoutMs = mode === "pyin" ? PYIN_TIMEOUT_MS : Math.max(15_000, Math.floor(PYIN_TIMEOUT_MS / 2));
  const { stdout } = await runSubprocess("python", [scriptPath, sourcePath, mode], timeoutMs, `librosa-${mode}`);
  const elapsedMs = Date.now() - startedAt;
  const payload = JSON.parse(stdout) as {
    notes: Array<{ start_s: number; end_s: number; pitch_midi: number; confidence: number }>;
    avg_pitch_midi: number | null;
    frames: number;
    voiced_frames: number;
  };
  console.info("[audio-analysis-worker] finalizando análise librosa", { analysis_mode: analysisMode, frames: payload.frames, voiced_frames: payload.voiced_frames, avg_pitch_midi: payload.avg_pitch_midi, elapsed_ms: elapsedMs });
  return { ...payload, elapsedMs, analysisMode };
}

async function preprocessAudioWithFfmpeg(inputPath: string, outputPath: string) {
  const startedAt = Date.now();
  await runSubprocess(
    "ffmpeg",
    ["-y", "-i", inputPath, "-ac", "1", "-ar", String(ANALYSIS_SAMPLE_RATE), "-t", String(ANALYSIS_MAX_SECONDS), outputPath],
    FFMPEG_TIMEOUT_MS,
    "ffmpeg-preprocess",
  );
  const elapsedMs = Date.now() - startedAt;
  console.info("[audio-analysis-worker] pré-processamento ffmpeg concluído", { input: inputPath, output: outputPath, elapsed_ms: elapsedMs, pipeline: `mp3->wav-mono-${ANALYSIS_SAMPLE_RATE}hz-${ANALYSIS_MAX_SECONDS}s` });
  return elapsedMs;
}

function buildInsights(notes: Array<{ start_s: number; end_s: number; pitch_midi: number; confidence: number }>) {
  const midis = notes.map((n) => n.pitch_midi);
  const minMidi = percentile(midis, 0.05);
  const maxMidi = percentile(midis, 0.95);
  const comfortMin = percentile(midis, 0.2);
  const comfortMax = percentile(midis, 0.8);

  const histogram = new Map<number, number>();
  for (const midi of midis) histogram.set(midi, (histogram.get(midi) ?? 0) + 1);
  const dominant = [...histogram.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([midi, count]) => ({ midi, note: midiToNoteName(midi), occurrences: count }));

  const confidence = notes.length ? notes.reduce((sum, n) => sum + n.confidence, 0) / notes.length : 0;
  const contour = notes.slice(0, 2000).map((n) => ({ t: Number(n.start_s.toFixed(3)), midi: n.pitch_midi, note: midiToNoteName(n.pitch_midi) }));

  const occasionalPeaks = notes
    .filter((n) => (minMidi !== null && n.pitch_midi <= minMidi - 1) || (maxMidi !== null && n.pitch_midi >= maxMidi + 1))
    .slice(0, 100)
    .map((n) => ({ t: Number(n.start_s.toFixed(3)), midi: n.pitch_midi, note: midiToNoteName(n.pitch_midi) }));

  const recommend = {
    comfortavel: { min_midi: comfortMin, max_midi: comfortMax },
    moderado: { min_midi: minMidi, max_midi: maxMidi },
    avancado: { min_midi: minMidi !== null ? minMidi - 2 : null, max_midi: maxMidi !== null ? maxMidi + 2 : null },
  };

  return { minMidi, maxMidi, comfortMin, comfortMax, dominant, confidence: Number(confidence.toFixed(4)), contour, occasionalPeaks, recommend };
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

async function processJob(job: any) {
  const jobStartedAt = Date.now();
  const workspace = await mkdtemp(join(tmpdir(), `analysis-${job.id}-`));
  const sourcePath = join(workspace, "source.audio");
  const optimizedWavPath = join(workspace, "optimized.wav");
  const logs: Array<Record<string, unknown>> = [];

  logs.push({ at: new Date().toISOString(), message: "FASE 3 worker iniciado" });
  const heartbeat = setInterval(() => {
    void supabase
      .from("audio_analysis_jobs")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "processing")
      .then(({ error }) => {
        if (error) console.error("[audio-analysis-worker] heartbeat update failed", { job_id: job.id, error: error.message });
      });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    console.info("[audio-analysis-worker] análise iniciada", { job_id: job.id, voice: job.voice ?? null, memory: currentMemorySnapshot() });
    if (!job.source_r2_key) throw new Error("Job sem source_r2_key.");

    console.info("[audio-analysis-worker] baixando áudio", { job_id: job.id, source_r2_key: job.source_r2_key });
    await downloadFromR2(job.source_r2_key, sourcePath);
    logs.push({ at: new Date().toISOString(), message: "Download do áudio concluído", source_r2_key: job.source_r2_key });

    const normalizedVoice = normalizeVoice(job.voice);
    if (IGNORED_ANALYSIS_LABELS.has(normalizedVoice)) throw new Error(`voice '${normalizedVoice}' não é elegível para análise de tessitura`);

    if (!DIRECT_VOICES.has(normalizedVoice)) {
      throw new Error(`Voice inválida para análise de tessitura: ${String(job.voice ?? "")}`);
    }

    const ffmpegElapsedMs = await preprocessAudioWithFfmpeg(sourcePath, optimizedWavPath);
    logs.push({ at: new Date().toISOString(), message: "Pré-processamento do áudio concluído", pipeline: `MP3 -> ffmpeg mono/${ANALYSIS_SAMPLE_RATE}/${ANALYSIS_MAX_SECONDS}s -> librosa.pyin`, ffmpeg_elapsed_ms: ffmpegElapsedMs, output_format: "wav" });

    let analysisResult;
    try {
      analysisResult = await runLibrosaPitchAnalysis(optimizedWavPath, "pyin");
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (!message.includes("timeout")) throw error;
      console.warn("[audio-analysis-worker] pyin timeout; aplicando fallback yin", { job_id: job.id, timeout_ms: PYIN_TIMEOUT_MS });
      logs.push({ at: new Date().toISOString(), message: "Timeout no librosa.pyin; fallback para librosa.yin", pyin_timeout_ms: PYIN_TIMEOUT_MS });
      analysisResult = await runLibrosaPitchAnalysis(optimizedWavPath, "yin");
    }

    if (!analysisResult.notes.length) {
      console.warn("[audio-analysis-worker] pyin sem notas detectadas; aplicando fallback yin", { job_id: job.id });
      analysisResult = await runLibrosaPitchAnalysis(optimizedWavPath, "yin");
    }

    const { notes, avg_pitch_midi, elapsedMs: pyinElapsedMs, analysisMode } = analysisResult;

    logs.push({ at: new Date().toISOString(), message: "Análise de tessitura concluída", analysis_mode: analysisMode, voice: normalizedVoice, notes_detected: notes.length, avg_pitch_midi, analysis_elapsed_ms: pyinElapsedMs });

    const insights = buildInsights(notes);
    if (insights.minMidi === null || insights.maxMidi === null) {
      throw new Error("no pitch detected");
    }
    console.info("[audio-analysis-worker] salvando análise", { job_id: job.id, analysis_mode: analysisMode, voice: normalizedVoice, pitch_medio_midi: avg_pitch_midi, min_midi: insights.minMidi, max_midi: insights.maxMidi, confidence: insights.confidence });

    const { error } = await supabase
      .from("audio_analysis_jobs")
      .update({
        status: "completed",
        analysis_method: analysisMode,
        detected_min_note: insights.minMidi,
        detected_max_note: insights.maxMidi,
        comfort_min_note: insights.comfortMin,
        comfort_max_note: insights.comfortMax,
        dominant_notes: insights.dominant,
        vocal_confidence: insights.confidence,
        pitch_events_json: {
          pitch_contour: insights.contour,
          occasional_peaks: insights.occasionalPeaks,
          recommended_tones: insights.recommend,
        },
        analysis_logs: logs,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) throw new Error(error.message);
    console.info("[audio-analysis-worker] análise concluída", { job_id: job.id, analysis_mode: analysisMode, voice: normalizedVoice, notes_detected: notes.length, detected_range: [insights.minMidi, insights.maxMidi], comfort_range: [insights.comfortMin, insights.comfortMax], elapsed_ms: Date.now() - jobStartedAt, memory: currentMemorySnapshot() });
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
    let message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("timed out") || message.toLowerCase().includes("timeout")) message = `timeout: ${message}`;
    if (err?.code === "ENOMEM" || message.toLowerCase().includes("out of memory")) message = `memory: ${message}`;
    logs.push({ at: new Date().toISOString(), message: "Falha no processamento", error: message });
    console.error("[audio-analysis-worker] falha ao processar job", { job_id: job.id, voice: job.voice ?? null, elapsed_ms: Date.now() - jobStartedAt, error: message, memory: currentMemorySnapshot() });

    await supabase
      .from("audio_analysis_jobs")
      .update({ status: "failed", error_message: message, analysis_logs: logs, completed_at: new Date().toISOString() })
      .eq("id", job.id);
  } finally {
    clearInterval(heartbeat);
    await Promise.allSettled([unlink(sourcePath), unlink(optimizedWavPath), rm(workspace, { recursive: true, force: true })]);
  }
}

async function main() {
  if (MAX_CONCURRENT_ANALYSIS !== 1) {
    console.warn("[audio-analysis-worker] MAX_CONCURRENT_ANALYSIS inválido para este worker; forçando execução serial", { configured: MAX_CONCURRENT_ANALYSIS, enforced: 1 });
  }
  console.info("[audio-analysis-worker] started", { ENABLE_SMART_TESSITURA_ANALYSIS, MAX_CONCURRENT_ANALYSIS: 1, analysis_pipeline: "ffmpeg-lite -> librosa-pyin-with-yin-fallback", analysis_max_seconds: ANALYSIS_MAX_SECONDS, analysis_sample_rate: ANALYSIS_SAMPLE_RATE, pyin_timeout_ms: PYIN_TIMEOUT_MS });

  while (true) {
    try {
      if (!ENABLE_SMART_TESSITURA_ANALYSIS) await sleep(3000);
      const job = await reserveJob();
      if (!job) {
        await sleep(3000);
        continue;
      }
      await processJob(job);
    } catch (error) {
      console.error("[audio-analysis-worker] loop error (continuando)", error);
      await sleep(5000);
    }
  }
}

main().catch((error) => {
  console.error("[audio-analysis-worker] erro inesperado no bootstrap (reiniciando loop)", error);
  setTimeout(() => {
    void main();
  }, 5000);
});
