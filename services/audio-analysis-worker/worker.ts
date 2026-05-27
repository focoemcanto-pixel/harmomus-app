import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

import { downloadFromR2 } from "./r2";

const execFileAsync = promisify(execFile);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const STALE_PROCESSING_MS = 20 * 60 * 1000;
const DEMUCS_TIMEOUT_MS = 12 * 60 * 1000;
const BASIC_PITCH_TIMEOUT_MS = 8 * 60 * 1000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLE_SMART_TESSITURA_ANALYSIS = String(process.env.ENABLE_SMART_TESSITURA_ANALYSIS ?? "false").toLowerCase() === "true";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

function midiToNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

async function reserveJob() {
  console.info("[audio-analysis-worker] reservando job");
  await failStaleProcessingJobs();

  const thresholdIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: activeProcessing, error: processingError } = await supabase
    .from("audio_analysis_jobs")
    .select("id, started_at")
    .eq("status", "processing")
    .gte("started_at", thresholdIso)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (processingError) throw new Error(processingError.message);
  if (activeProcessing) {
    console.info("[audio-analysis-worker] job processing recente encontrado, aguardando", {
      processing_job_id: activeProcessing.id,
      started_at: activeProcessing.started_at,
    });
    return null;
  }

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

async function failStaleProcessingJobs() {
  const staleThresholdIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: staleJobs, error: staleQueryError } = await supabase
    .from("audio_analysis_jobs")
    .select("id")
    .eq("status", "processing")
    .lt("started_at", staleThresholdIso);

  if (staleQueryError) throw new Error(staleQueryError.message);
  if (!staleJobs?.length) return;

  for (const staleJob of staleJobs) {
    const { error: failError } = await supabase
      .from("audio_analysis_jobs")
      .update({
        status: "failed",
        error_message: "stale processing timeout",
        completed_at: new Date().toISOString(),
      })
      .eq("id", staleJob.id)
      .eq("status", "processing");

    if (failError) throw new Error(failError.message);
    console.warn("[audio-analysis-worker] stale job marcado como failed", { job_id: staleJob.id });
  }
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

async function runDemucsAndBasicPitch(sourcePath: string, workingDir: string) {
  const demucsOutDir = join(workingDir, "demucs");
  console.info("[audio-analysis-worker] iniciando Demucs");

  await execFileAsync(
    "demucs",
    ["--two-stems", "vocals", "--name", "mdx_extra_q", "--device", "cpu", "-j", "1", "-o", demucsOutDir, sourcePath],
    {
      timeout: DEMUCS_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, OMP_NUM_THREADS: "1", MKL_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1" },
    },
  );
  console.info("[audio-analysis-worker] finalizando Demucs");

  const { stdout: findStdout } = await execFileAsync("bash", ["-lc", `find ${JSON.stringify(demucsOutDir)} -type f -name vocals.wav | head -n 1`]);
  const stemPath = findStdout.trim();
  if (!stemPath) throw new Error("Demucs não retornou stem vocal (vocals.wav).");

  const basicPitchOut = join(workingDir, "basic-pitch");
  console.info("[audio-analysis-worker] iniciando BasicPitch");
  await execFileAsync("basic-pitch", [basicPitchOut, stemPath], { timeout: BASIC_PITCH_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
  console.info("[audio-analysis-worker] finalizando BasicPitch");

  const { stdout: csvPathStdout } = await execFileAsync("bash", ["-lc", `find ${JSON.stringify(basicPitchOut)} -type f -name '*.csv' | head -n 1`]);
  const csvPath = csvPathStdout.trim();
  if (!csvPath) throw new Error("Basic Pitch não gerou CSV.");

  const csv = await readFile(csvPath, "utf-8");
  return { stemPath, notes: parseBasicPitchCsv(csv) };
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

async function processJob(job: any) {
  const workspace = await mkdtemp(join(tmpdir(), `analysis-${job.id}-`));
  const sourcePath = join(workspace, "source.audio");
  const logs: Array<Record<string, unknown>> = [];

  logs.push({ at: new Date().toISOString(), message: "FASE 3 worker iniciado" });

  try {
    if (!job.source_r2_key) throw new Error("Job sem source_r2_key.");

    console.info("[audio-analysis-worker] baixando áudio", { job_id: job.id, source_r2_key: job.source_r2_key });
    await downloadFromR2(job.source_r2_key, sourcePath);
    logs.push({ at: new Date().toISOString(), message: "Download do áudio concluído", source_r2_key: job.source_r2_key });

    const { stemPath, notes } = await runDemucsAndBasicPitch(sourcePath, workspace);
    logs.push({ at: new Date().toISOString(), message: "Demucs + Basic Pitch concluídos", vocal_stem_path: stemPath, notes_detected: notes.length });

    const insights = buildInsights(notes);
    console.info("[audio-analysis-worker] salvando análise", { job_id: job.id, notes_detected: notes.length });

    const { error } = await supabase
      .from("audio_analysis_jobs")
      .update({
        status: "completed",
        analysis_method: "demucs+basic-pitch-v1",
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
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
    let message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("timed out")) message = `timeout: ${message}`;
    if (err?.code === "ENOMEM" || message.toLowerCase().includes("out of memory")) message = `memory: ${message}`;
    logs.push({ at: new Date().toISOString(), message: "Falha no processamento", error: message });
    console.error("[audio-analysis-worker] falha ao processar job", { job_id: job.id, error: message });

    await supabase
      .from("audio_analysis_jobs")
      .update({ status: "failed", error_message: message, analysis_logs: logs })
      .eq("id", job.id);
  } finally {
    await Promise.allSettled([unlink(sourcePath), rm(workspace, { recursive: true, force: true })]);
  }
}

async function main() {
  console.info("[audio-analysis-worker] started", { ENABLE_SMART_TESSITURA_ANALYSIS });

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
