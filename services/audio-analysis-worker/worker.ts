import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { downloadFromR2 } from "./r2";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HEARTBEAT_INTERVAL_MS = 15 * 1000;
const STALE_PROCESSING_MS = 10 * 60 * 1000;
const DEMUCS_TIMEOUT_MS = 12 * 60 * 1000;
const DEFAULT_DEMUCS_MODEL = "htdemucs";
const BASIC_PITCH_TIMEOUT_MS = 8 * 60 * 1000;
const KILL_GRACE_MS = 2_000;
const MAX_CONCURRENT_ANALYSIS = Number(process.env.MAX_CONCURRENT_ANALYSIS ?? "1");
const DEMUCS_CACHE_DIR = process.env.DEMUCS_CACHE_DIR ?? "/opt/demucs-cache";
const ENABLE_DEMUCS_ANALYSIS = String(process.env.ENABLE_DEMUCS_ANALYSIS ?? "false").toLowerCase() === "true";

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

function parseBasicPitchCsv(csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [] as Array<{ start_s: number; end_s: number; pitch_midi: number; confidence: number }>;

  const header = lines[0]!.split(",").map((v) => v.trim());
  const getIndex = (name: string) => header.findIndex((h) => h === name);
  const startIdx = getIndex("start_s");
  const endIdx = getIndex("end_s");
  const midiIdx = getIndex("pitch_midi");
  const confidenceIdx = getIndex("velocity");

  return lines.slice(1).flatMap((line) => {
    const cols = line.split(",");
    const start_s = Number(cols[startIdx]);
    const end_s = Number(cols[endIdx]);
    const pitch_midi = Math.round(Number(cols[midiIdx]));
    const confidence = Number.isFinite(Number(cols[confidenceIdx])) ? Number(cols[confidenceIdx]) : 0.8;
    if (!Number.isFinite(start_s) || !Number.isFinite(end_s) || !Number.isFinite(pitch_midi)) return [];
    return [{ start_s, end_s, pitch_midi, confidence }];
  });
}

async function runBasicPitch(sourcePath: string, workingDir: string) {
  const basicPitchOut = join(workingDir, "basic-pitch");
  console.info("[audio-analysis-worker] iniciando BasicPitch", { analysis_mode: "basicpitch-direct" });
  await runSubprocess("basic-pitch", [basicPitchOut, sourcePath], BASIC_PITCH_TIMEOUT_MS, "basicpitch");
  console.info("[audio-analysis-worker] finalizando BasicPitch", { analysis_mode: "basicpitch-direct" });

  const { stdout: csvPathStdout } = await runSubprocess("bash", ["-lc", `find ${JSON.stringify(basicPitchOut)} -type f -name '*.csv' | head -n 1`], 15000, "find-basicpitch-csv");
  const csvPath = csvPathStdout.trim();
  if (!csvPath) throw new Error("Basic Pitch não gerou CSV.");

  const csv = await readFile(csvPath, "utf-8");
  return { stemPath: sourcePath, notes: parseBasicPitchCsv(csv) };
}

async function runDemucsAndBasicPitch(sourcePath: string, workingDir: string) {
  const demucsOutDir = join(workingDir, "demucs");
  const configuredDemucsModel = (process.env.DEMUCS_MODEL ?? DEFAULT_DEMUCS_MODEL).trim() || DEFAULT_DEMUCS_MODEL;
  const fallbackDemucsModel = "htdemucs";
  const demucsModels = [configuredDemucsModel, fallbackDemucsModel].filter((model, idx, arr) => arr.indexOf(model) === idx);

  console.info("[audio-analysis-worker] Demucs usado apenas para análise de tessitura, não para áudio final", {
    configured_model: configuredDemucsModel,
    fallback_model: fallbackDemucsModel,
    attempts: demucsModels,
  });

  let usedModel: string | null = null;
  const demucsStartedAt = Date.now();
  for (const model of demucsModels) {
    try {
      console.info("[audio-analysis-worker] iniciando Demucs", { model });
      await runSubprocess(
        "demucs",
        ["--two-stems", "vocals", "--name", model, "--device", "cpu", "-j", "1", "-o", demucsOutDir, sourcePath],
        DEMUCS_TIMEOUT_MS,
        `demucs-${model}`,
        { OMP_NUM_THREADS: "1", MKL_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", DEMUCS_CACHE: DEMUCS_CACHE_DIR, XDG_CACHE_HOME: DEMUCS_CACHE_DIR },
      );
      usedModel = model;
      console.info("[audio-analysis-worker] Demucs finalizado", { used_model: usedModel, elapsed_ms: Date.now() - demucsStartedAt });
      break;
    } catch (error) {
      console.warn("[audio-analysis-worker] falha no Demucs, tentando fallback", {
        attempted_model: model,
        elapsed_ms: Date.now() - demucsStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!usedModel) {
    throw new Error(`Demucs falhou para todos os modelos configurados: ${demucsModels.join(", ")}.`);
  }

  const { stdout: findStdout } = await runSubprocess("bash", ["-lc", `find ${JSON.stringify(demucsOutDir)} -type f -name vocals.wav | head -n 1`], 15000, "find-demucs");
  const stemPath = findStdout.trim();
  if (!stemPath) throw new Error("Demucs não retornou stem vocal (vocals.wav).");

  const analysis = await runBasicPitch(stemPath, workingDir);
  return { stemPath, notes: analysis.notes };
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
    if (IGNORED_ANALYSIS_LABELS.has(normalizedVoice)) {
      logs.push({ at: new Date().toISOString(), message: "Arquivo ignorado para análise de tessitura", voice: normalizedVoice, reason: "ignored-label" });
      await supabase
        .from("audio_analysis_jobs")
        .update({
          status: "completed",
          analysis_method: "ignored",
          analysis_logs: logs,
          error_message: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      console.info("[audio-analysis-worker] arquivo ignorado", { job_id: job.id, voice: normalizedVoice });
      return;
    }

    if (!DIRECT_VOICES.has(normalizedVoice)) {
      throw new Error(`Voice inválida para análise de tessitura: ${String(job.voice ?? "")}`);
    }

    const analysisMode = ENABLE_DEMUCS_ANALYSIS ? "demucs+basicpitch" : "basicpitch-direct";
    const { stemPath, notes } = ENABLE_DEMUCS_ANALYSIS
      ? await runDemucsAndBasicPitch(sourcePath, workspace)
      : await runBasicPitch(sourcePath, workspace);

    logs.push({ at: new Date().toISOString(), message: "Análise de tessitura concluída", analysis_mode: analysisMode, voice: normalizedVoice, vocal_stem_path: stemPath, notes_detected: notes.length });

    const insights = buildInsights(notes);
    console.info("[audio-analysis-worker] salvando análise", { job_id: job.id, analysis_mode: analysisMode, voice: normalizedVoice, notes_detected: notes.length, comfort_range: [insights.comfortMin, insights.comfortMax] });

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
    await Promise.allSettled([unlink(sourcePath), rm(workspace, { recursive: true, force: true })]);
  }
}

async function main() {
  if (MAX_CONCURRENT_ANALYSIS !== 1) {
    console.warn("[audio-analysis-worker] MAX_CONCURRENT_ANALYSIS inválido para este worker; forçando execução serial", { configured: MAX_CONCURRENT_ANALYSIS, enforced: 1 });
  }
  console.info("[audio-analysis-worker] started", { ENABLE_SMART_TESSITURA_ANALYSIS, ENABLE_DEMUCS_ANALYSIS, MAX_CONCURRENT_ANALYSIS: 1, demucs_cache_dir: DEMUCS_CACHE_DIR });

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
