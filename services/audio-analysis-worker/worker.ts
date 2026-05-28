import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { downloadFromR2 } from "./r2";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HEARTBEAT_INTERVAL_MS = 15 * 1000;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const ANALYSIS_MAX_SECONDS = Math.min(Number(process.env.ANALYSIS_MAX_SECONDS ?? "30"), 30);
const ANALYSIS_SAMPLE_RATE = 16000;
const ANALYSIS_TIMEOUT_MS = 15_000;
const FFMPEG_TIMEOUT_MS = 15_000;
const KILL_GRACE_MS = 2_000;
const MAX_CONCURRENT_ANALYSIS = 1;

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
  console.info("[audio-analysis-worker] reservando job", { memory: currentMemorySnapshot() });
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
  if (!processingJobs || processingJobs.length <= MAX_CONCURRENT_ANALYSIS) return;

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
    max_concurrent_analysis: MAX_CONCURRENT_ANALYSIS,
    keep_job_id: keep.id,
    stale_job_ids: staleIds,
    memory: currentMemorySnapshot(),
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
    execFile("bash", ["-lc", `pkill -TERM -P ${pid} || true; sleep 0.2; pkill -KILL -P ${pid} || true`], () => resolve());
  });
}

async function runSubprocess(command: string, args: string[], timeoutMs: number, timeoutLogLabel: string, extraEnv?: Record<string, string>) {
  return await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const startedAt = Date.now();
    const child = spawn(command, args, {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1", NUMEXPR_NUM_THREADS: "1", ...extraEnv },
    });

    const rejectTimeout = () => {
      if (settled) return;
      settled = true;
      const elapsedMs = Date.now() - startedAt;
      reject(new Error(`timeout ${timeoutLogLabel}: subprocess exceeded ${timeoutMs}ms (elapsed_ms=${elapsedMs})`));
    };

    const killTree = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      void killDescendants(child.pid);
      try {
        process.kill(-child.pid, signal);
        console.warn("[audio-analysis-worker] subprocess kill tree", { command, pid: child.pid, signal, timeout_label: timeoutLogLabel });
      } catch {
        try {
          child.kill(signal);
          console.warn("[audio-analysis-worker] subprocess kill fallback", { command, pid: child.pid, signal, timeout_label: timeoutLogLabel });
        } catch {
          // noop
        }
      }
    };

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      console.error("[audio-analysis-worker] timeout detection", {
        command,
        pid: child.pid,
        timeout_label: timeoutLogLabel,
        timeout_ms: timeoutMs,
        elapsed_ms: Date.now() - startedAt,
        memory: currentMemorySnapshot(),
      });
      killTree("SIGTERM");
      setTimeout(() => killTree("SIGKILL"), KILL_GRACE_MS / 2);
      setTimeout(rejectTimeout, KILL_GRACE_MS);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString();
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
      const elapsedMs = Date.now() - startedAt;
      console.info("[audio-analysis-worker] subprocess finalizado", { command, exit_code: code, signal, elapsed_ms: elapsedMs, timed_out: timedOut });
      if (timedOut) {
        reject(new Error(`timeout ${timeoutLogLabel}: subprocess killed after ${timeoutMs}ms`));
        return;
      }
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

type PitchNote = { start_s: number; end_s: number; pitch_midi: number; confidence: number };

type YinPayload = {
  notes: PitchNote[];
  avg_pitch_midi: number | null;
  frames: number;
  voiced_frames: number;
  detected_min_midi: number | null;
  detected_max_midi: number | null;
  comfort_min_midi: number | null;
  comfort_max_midi: number | null;
  dominant_notes: Array<{ midi: number; note: string; occurrences: number }>;
};

async function runLibrosaPitchAnalysis(sourcePath: string) {
  const analysisMode = "librosa-yin-lightweight";
  console.info("[audio-analysis-worker] librosa start", {
    analysis_mode: analysisMode,
    source: sourcePath,
    timeout_ms: ANALYSIS_TIMEOUT_MS,
    memory: currentMemorySnapshot(),
  });

  const scriptPath = join(process.cwd(), "scripts", "analyze_yin.py");
  const startedAt = Date.now();

  const { stdout } = await runSubprocess(
    "python",
    [scriptPath, sourcePath],
    ANALYSIS_TIMEOUT_MS,
    "librosa-yin",
  );

  const elapsedMs = Date.now() - startedAt;
  const payload = JSON.parse(stdout) as YinPayload;

  console.info("[audio-analysis-worker] librosa end", {
    analysis_mode: analysisMode,
    elapsed_ms: elapsedMs,
    frames: payload.frames,
    voiced_frames: payload.voiced_frames,
    detected_min_midi: payload.detected_min_midi,
    detected_max_midi: payload.detected_max_midi,
    memory: currentMemorySnapshot(),
  });

  return { ...payload, elapsedMs, analysisMode };
}

async function preprocessAudioWithFfmpeg(inputPath: string, outputPath: string) {
  const startedAt = Date.now();
  console.info("[audio-analysis-worker] preprocess start", {
    input: inputPath,
    output: outputPath,
    sample_rate: ANALYSIS_SAMPLE_RATE,
    max_seconds: ANALYSIS_MAX_SECONDS,
    filter: "highpass=f=80,lowpass=f=1200",
    timeout_ms: FFMPEG_TIMEOUT_MS,
    memory: currentMemorySnapshot(),
  });
  await runSubprocess(
    "ffmpeg",
    ["-y", "-i", inputPath, "-ac", "1", "-ar", String(ANALYSIS_SAMPLE_RATE), "-t", String(ANALYSIS_MAX_SECONDS), "-af", "highpass=f=80,lowpass=f=1200", outputPath],
    FFMPEG_TIMEOUT_MS,
    "ffmpeg-preprocess",
  );
  const elapsedMs = Date.now() - startedAt;
  console.info("[audio-analysis-worker] preprocess end", {
    input: inputPath,
    output: outputPath,
    elapsed_ms: elapsedMs,
    pipeline: `ffmpeg mono/${ANALYSIS_SAMPLE_RATE}Hz/${ANALYSIS_MAX_SECONDS}s/highpass80-lowpass1200`,
    memory: currentMemorySnapshot(),
  });
  return elapsedMs;
}

function buildInsights(notes: PitchNote[], payload?: Partial<YinPayload>) {
  const midis = notes.map((n) => n.pitch_midi);

  const minMidi = payload?.detected_min_midi ?? percentile(midis, 0.05);
  const maxMidi = payload?.detected_max_midi ?? percentile(midis, 0.95);
  const comfortMin = payload?.comfort_min_midi ?? percentile(midis, 0.2);
  const comfortMax = payload?.comfort_max_midi ?? percentile(midis, 0.8);

  const dominant = payload?.dominant_notes?.length ? payload.dominant_notes : (() => {
    const histogram = new Map<number, number>();
    for (const midi of midis) histogram.set(midi, (histogram.get(midi) ?? 0) + 1);
    return [...histogram.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([midi, count]) => ({ midi, note: midiToNoteName(midi), occurrences: count }));
  })();

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

  logs.push({ at: new Date().toISOString(), message: "Worker de tessitura leve iniciado", pipeline: "ffmpeg-lite -> librosa.yin" });
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
    logs.push({ at: new Date().toISOString(), message: "Pré-processamento do áudio concluído", pipeline: `ffmpeg -ac 1 -ar ${ANALYSIS_SAMPLE_RATE} -t ${ANALYSIS_MAX_SECONDS} -af highpass=f=80,lowpass=f=1200`, ffmpeg_elapsed_ms: ffmpegElapsedMs, output_format: "wav" });

    const analysisResult = await runLibrosaPitchAnalysis(optimizedWavPath);
    const { notes, avg_pitch_midi, elapsedMs: analysisElapsedMs, analysisMode } = analysisResult;

    logs.push({ at: new Date().toISOString(), message: "Análise de tessitura concluída", analysis_mode: analysisMode, voice: normalizedVoice, notes_detected: notes.length, avg_pitch_midi, analysis_elapsed_ms: analysisElapsedMs });

    const insights = buildInsights(notes, analysisResult);
    if (insights.minMidi === null || insights.maxMidi === null) {
      throw new Error("no pitch detected");
    }
    console.info("[audio-analysis-worker] salvando análise", { job_id: job.id, analysis_mode: analysisMode, voice: normalizedVoice, pitch_medio_midi: avg_pitch_midi, min_midi: insights.minMidi, max_midi: insights.maxMidi, comfort_min_midi: insights.comfortMin, comfort_max_midi: insights.comfortMax, confidence: insights.confidence });

    const { error } = await supabase
      .from("audio_analysis_jobs")
      .update({
        status: "completed",
        analysis_method: analysisMode,
        detected_min_midi: insights.minMidi,
        detected_max_midi: insights.maxMidi,
        comfort_min_midi: insights.comfortMin,
        comfort_max_midi: insights.comfortMax,
        detected_min_note: insights.minMidi,
        detected_max_note: insights.maxMidi,
        comfort_min_note: insights.comfortMin,
        comfort_max_note: insights.comfortMax,
        dominant_notes: insights.dominant,
        recommended_tones: insights.recommend,
        vocal_confidence: insights.confidence,
        pitch_events_json: {
          recommended_tones: insights.recommend,
          contour: insights.contour,
          occasional_peaks: insights.occasionalPeaks,
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
    const cleanupStartedAt = Date.now();
    await Promise.allSettled([unlink(sourcePath), unlink(optimizedWavPath), rm(workspace, { recursive: true, force: true })]);
    console.info("[audio-analysis-worker] cleanup concluído", { job_id: job.id, workspace, elapsed_ms: Date.now() - cleanupStartedAt, memory: currentMemorySnapshot() });
  }
}

async function main() {
  const configuredMax = Number(process.env.MAX_CONCURRENT_ANALYSIS ?? "1");
  if (configuredMax !== MAX_CONCURRENT_ANALYSIS) {
    console.warn("[audio-analysis-worker] MAX_CONCURRENT_ANALYSIS inválido para este worker; forçando execução serial", { configured: configuredMax, enforced: MAX_CONCURRENT_ANALYSIS });
  }
  console.info("[audio-analysis-worker] started", { ENABLE_SMART_TESSITURA_ANALYSIS, MAX_CONCURRENT_ANALYSIS, analysis_pipeline: "ffmpeg-lite -> librosa-yin", analysis_max_seconds: ANALYSIS_MAX_SECONDS, analysis_sample_rate: ANALYSIS_SAMPLE_RATE, analysis_timeout_ms: ANALYSIS_TIMEOUT_MS, memory: currentMemorySnapshot() });

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
