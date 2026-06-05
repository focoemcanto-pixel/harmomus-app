import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { downloadFromR2 } from "./r2";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HEARTBEAT_INTERVAL_MS = 15 * 1000;
const STALE_PROCESSING_MS = 30 * 60 * 1000;

const ANALYSIS_MAX_SECONDS = Math.max(0, Number(process.env.ANALYSIS_MAX_SECONDS ?? "0") || 0);
const ANALYSIS_SAMPLE_RATE = 16000;
const ANALYSIS_TIMEOUT_MS = Math.max(30_000, Number(process.env.ANALYSIS_TIMEOUT_MS ?? "120000") || 120_000);
const FFMPEG_TIMEOUT_MS = Math.max(30_000, Number(process.env.FFMPEG_TIMEOUT_MS ?? "90000") || 90_000);
const MAX_CONCURRENT_ANALYSIS = 1;
const MIN_PITCH_CONFIDENCE = Math.max(0, Math.min(1, Number(process.env.MIN_PITCH_CONFIDENCE ?? "0.75") || 0.75));
const MIN_SUSTAINED_NOTE_MS = Math.max(40, Number(process.env.MIN_SUSTAINED_NOTE_MS ?? "80") || 80);
const NOTE_GAP_TOLERANCE_SECONDS = 0.06;
const DOMINANT_COVERAGE_RATIO = 0.8;
const MUSICAL_RANGE_MARGIN_SEMITONES = Math.max(0, Math.min(2, Number(process.env.MUSICAL_RANGE_MARGIN_SEMITONES ?? "1") || 1));

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
  const rounded = Math.round(midi);
  const note = names[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${note}${octave}`;
}

function normalizeVoice(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const DIRECT_VOICES = new Set(["soprano", "contralto", "tenor"]);
const IGNORED_ANALYSIS_LABELS = new Set(["todos", "mix", "completo"]);
const VOICE_RANGES: Record<string, { min: number; max: number }> = {
  soprano: { min: 48, max: 84 },
  contralto: { min: 43, max: 79 },
  tenor: { min: 48, max: 72 },
};

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

type FilterStats = {
  raw_events: number;
  removed_by_range: number;
  removed_by_confidence: number;
  removed_by_duration: number;
  octave_corrections: number;
  final_events: number;
};

type NoteDistributionEntry = {
  midi: number;
  note: string;
  duration_s: number;
  occurrences: number;
  duration_ratio: number;
};

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
    .update({ status: "processing", started_at: new Date().toISOString() })
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
    .update({ status: "failed", error_message: staleReason, completed_at: new Date().toISOString() })
    .in("id", staleIds)
    .eq("status", "processing");

  if (failError) throw new Error(failError.message);
}

async function recoverStaleProcessingJobs() {
  const staleThresholdIso = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: recoveredJobs, error: recoverError } = await supabase
    .from("audio_analysis_jobs")
    .update({ status: "pending", started_at: null, error_message: null })
    .eq("status", "processing")
    .lt("started_at", staleThresholdIso)
    .select("id,started_at");

  if (recoverError) throw new Error(recoverError.message);
  if (!recoveredJobs?.length) return;
  console.warn("[audio-analysis-worker] stale jobs recovered", { jobs: recoveredJobs });
}

async function runSubprocess(command: string, args: string[], timeoutMs: number, timeoutLogLabel: string, extraEnv?: Record<string, string>) {
  return await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const startedAt = Date.now();
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1", NUMEXPR_NUM_THREADS: "1", ...extraEnv },
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      console.error("[audio-analysis-worker] timeout detection", { command, pid: child.pid, timeout_label: timeoutLogLabel, timeout_ms: timeoutMs, memory: currentMemorySnapshot() });
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000);
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
      if (timedOut) {
        reject(new Error(`timeout ${timeoutLogLabel}: subprocess killed after ${timeoutMs}ms (elapsed_ms=${Date.now() - startedAt})`));
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

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function midiRange(min: number | null, max: number | null) {
  return {
    min_midi: min,
    max_midi: max,
    min_note: isNumber(min) ? midiToNoteName(min) : null,
    max_note: isNumber(max) ? midiToNoteName(max) : null,
  };
}

function noteDuration(note: PitchNote) {
  return Math.max(0.001, note.end_s - note.start_s);
}

function normalizePitchNote(note: PitchNote): PitchNote {
  return {
    start_s: Number(note.start_s),
    end_s: Number(note.end_s),
    pitch_midi: Math.round(Number(note.pitch_midi)),
    confidence: isNumber(note.confidence) ? note.confidence : 0,
  };
}

function voiceRangeFor(voice: string) {
  return VOICE_RANGES[normalizeVoice(voice)] ?? { min: 36, max: 84 };
}

function shouldCorrectOctave(note: PitchNote, notes: PitchNote[], index: number, voiceRange: { min: number; max: number }) {
  const midi = Math.round(note.pitch_midi);
  const raised = midi + 12;
  if (midi >= voiceRange.min || raised > voiceRange.max) return false;

  const window = notes.slice(Math.max(0, index - 5), Math.min(notes.length, index + 6));
  const neighbors = window.filter((candidate) => candidate !== note && Math.abs(candidate.start_s - note.start_s) <= 0.5);
  const contextualEvidence = neighbors.filter((candidate) => Math.abs(Math.round(candidate.pitch_midi) - raised) <= 2).length;
  const samePitchClassEvidence = neighbors.filter((candidate) => Math.abs(Math.round(candidate.pitch_midi) - raised) <= 12 && Math.round(candidate.pitch_midi) % 12 === raised % 12).length;

  return contextualEvidence >= 1 || samePitchClassEvidence >= 2;
}

function correctOctaveErrors(notes: PitchNote[], voice: string) {
  const voiceRange = voiceRangeFor(voice);
  let corrections = 0;
  const sorted = [...notes].sort((a, b) => a.start_s - b.start_s);
  const corrected = sorted.map((note, index) => {
    if (!shouldCorrectOctave(note, sorted, index, voiceRange)) return note;
    corrections += 1;
    return { ...note, pitch_midi: Math.round(note.pitch_midi) + 12 };
  });

  return { notes: corrected, corrections };
}

function mergeAndFilterSustainedNotes(notes: PitchNote[]) {
  const sorted = [...notes].sort((a, b) => a.start_s - b.start_s);
  const merged: PitchNote[] = [];
  let removedByDuration = 0;
  let current: (PitchNote & { confidence_sum: number; frames: number }) | null = null;

  const flush = () => {
    if (!current) return;
    const durationMs = noteDuration(current) * 1000;
    if (durationMs < MIN_SUSTAINED_NOTE_MS) {
      removedByDuration += current.frames;
      current = null;
      return;
    }
    merged.push({
      start_s: current.start_s,
      end_s: current.end_s,
      pitch_midi: current.pitch_midi,
      confidence: Number((current.confidence_sum / current.frames).toFixed(4)),
    });
    current = null;
  };

  for (const note of sorted) {
    const midi = Math.round(note.pitch_midi);
    if (current && Math.round(current.pitch_midi) === midi && note.start_s - current.end_s <= NOTE_GAP_TOLERANCE_SECONDS) {
      current.end_s = Math.max(current.end_s, note.end_s);
      current.confidence_sum += note.confidence;
      current.frames += 1;
      continue;
    }
    flush();
    current = { ...note, pitch_midi: midi, confidence_sum: note.confidence, frames: 1 };
  }
  flush();

  return { notes: merged, removedByDuration };
}

function filterPitchNotesForVoice(notes: PitchNote[], voice: string) {
  const voiceRange = voiceRangeFor(voice);
  const stats: FilterStats = {
    raw_events: notes.length,
    removed_by_range: 0,
    removed_by_confidence: 0,
    removed_by_duration: 0,
    octave_corrections: 0,
    final_events: 0,
  };

  const normalized = notes
    .map(normalizePitchNote)
    .filter((note) => Number.isFinite(note.start_s) && Number.isFinite(note.end_s) && note.end_s > note.start_s && Number.isFinite(note.pitch_midi));

  const confidenceFiltered = normalized.filter((note) => {
    const keep = note.confidence >= MIN_PITCH_CONFIDENCE;
    if (!keep) stats.removed_by_confidence += 1;
    return keep;
  });

  const octaveResult = correctOctaveErrors(confidenceFiltered, voice);
  stats.octave_corrections = octaveResult.corrections;

  const rangeFiltered = octaveResult.notes.filter((note) => {
    const midi = Math.round(note.pitch_midi);
    const keep = midi >= voiceRange.min && midi <= voiceRange.max;
    if (!keep) stats.removed_by_range += 1;
    return keep;
  });

  const sustained = mergeAndFilterSustainedNotes(rangeFiltered);
  stats.removed_by_duration = sustained.removedByDuration;
  stats.final_events = sustained.notes.length;

  return { notes: sustained.notes, stats, voiceRange };
}

function buildFallbackDominant(midis: number[]) {
  const histogram = new Map<number, number>();
  for (const midi of midis) histogram.set(Math.round(midi), (histogram.get(Math.round(midi)) ?? 0) + 1);
  return [...histogram.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([midi, count]) => ({ midi, note: midiToNoteName(midi), occurrences: count }));
}

function buildNoteDistribution(notes: PitchNote[]): NoteDistributionEntry[] {
  const totalDuration = notes.reduce((sum, note) => sum + noteDuration(note), 0);
  const distribution = new Map<number, { midi: number; note: string; duration_s: number; occurrences: number }>();

  for (const note of notes) {
    const midi = Math.round(note.pitch_midi);
    const current = distribution.get(midi) ?? { midi, note: midiToNoteName(midi), duration_s: 0, occurrences: 0 };
    current.duration_s += noteDuration(note);
    current.occurrences += 1;
    distribution.set(midi, current);
  }

  return [...distribution.values()]
    .map((entry) => ({
      ...entry,
      duration_s: Number(entry.duration_s.toFixed(3)),
      duration_ratio: totalDuration > 0 ? Number((entry.duration_s / totalDuration).toFixed(4)) : 0,
    }))
    .sort((a, b) => a.midi - b.midi);
}

function buildDominantRange(distribution: NoteDistributionEntry[]) {
  if (!distribution.length) return midiRange(null, null);
  let coverage = 0;
  const selected = [...distribution]
    .sort((a, b) => b.duration_s - a.duration_s)
    .filter((entry) => {
      if (coverage >= DOMINANT_COVERAGE_RATIO) return false;
      coverage += entry.duration_ratio;
      return true;
    })
    .map((entry) => entry.midi);

  return midiRange(percentile(selected, 0), percentile(selected, 1));
}

function buildMusicalRange(dominantRange: ReturnType<typeof midiRange>, voiceRange: { min: number; max: number }) {
  if (!isNumber(dominantRange.min_midi) || !isNumber(dominantRange.max_midi)) return midiRange(null, null);
  return midiRange(
    clamp(dominantRange.min_midi - MUSICAL_RANGE_MARGIN_SEMITONES, voiceRange.min, voiceRange.max),
    clamp(dominantRange.max_midi + MUSICAL_RANGE_MARGIN_SEMITONES, voiceRange.min, voiceRange.max),
  );
}

function buildPeakNotes(distribution: NoteDistributionEntry[], musicalRange: ReturnType<typeof midiRange>) {
  if (!isNumber(musicalRange.min_midi) || !isNumber(musicalRange.max_midi)) return [];
  return distribution
    .filter((entry) => entry.midi < musicalRange.min_midi! || entry.midi > musicalRange.max_midi!)
    .map((entry) => ({
      midi: entry.midi,
      note: entry.note,
      direction: entry.midi < musicalRange.min_midi! ? "low" : "high",
      duration_s: entry.duration_s,
      duration_ratio: entry.duration_ratio,
      occurrences: entry.occurrences,
    }))
    .sort((a, b) => b.duration_ratio - a.duration_ratio || a.midi - b.midi);
}

function buildExtrema(distribution: NoteDistributionEntry[]) {
  if (!distribution.length) {
    return { lowest_note: null, highest_note: null };
  }
  const byMidi = [...distribution].sort((a, b) => a.midi - b.midi);
  const lowest = byMidi[0];
  const highest = byMidi[byMidi.length - 1];
  const serialize = (entry: NoteDistributionEntry | undefined) =>
    entry
      ? {
          midi: entry.midi,
          note: entry.note,
          duration_s: entry.duration_s,
          duration_ratio: entry.duration_ratio,
          occurrences: entry.occurrences,
        }
      : null;
  return { lowest_note: serialize(lowest), highest_note: serialize(highest) };
}

function calculateTessituraScore(notes: PitchNote[], comfortMin: number | null, comfortMax: number | null, minMidi: number | null, maxMidi: number | null) {
  if (!notes.length || !isNumber(comfortMin) || !isNumber(comfortMax) || !isNumber(minMidi) || !isNumber(maxMidi)) return 0;

  const totalDuration = notes.reduce((sum, note) => sum + noteDuration(note), 0);
  if (totalDuration <= 0) return 0;

  const comfortDuration = notes
    .filter((note) => note.pitch_midi >= comfortMin && note.pitch_midi <= comfortMax)
    .reduce((sum, note) => sum + noteDuration(note), 0);
  const comfortRatio = comfortDuration / totalDuration;
  const detectedSpan = Math.max(1, maxMidi - minMidi);
  const comfortSpan = Math.max(1, comfortMax - comfortMin);
  const concentrationRatio = clamp(comfortSpan / detectedSpan, 0, 1);
  const avgConfidence = notes.reduce((sum, note) => sum + note.confidence, 0) / notes.length;
  const peakPenalty = Math.max(0, 1 - concentrationRatio) * 20;
  const rawScore = comfortRatio * 55 + avgConfidence * 25 + concentrationRatio * 20 - peakPenalty;

  return Math.round(clamp(rawScore, 0, 100));
}

function buildMusicalLayers(notes: PitchNote[], midis: number[], comfortMin: number | null, comfortMax: number | null, minMidi: number | null, maxMidi: number | null, voiceRange: { min: number; max: number }) {
  const noteDistribution = buildNoteDistribution(notes);
  const dominantRange = buildDominantRange(noteDistribution);
  const musicalRange = buildMusicalRange(dominantRange, voiceRange);
  const lowPeakMin = percentile(midis, 0);
  const lowPeakMax = percentile(midis, 0.05);
  const lowStressMin = percentile(midis, 0.05);
  const lowStressMax = percentile(midis, 0.2);
  const highStressMin = percentile(midis, 0.8);
  const highStressMax = percentile(midis, 0.95);
  const highPeakMin = percentile(midis, 0.95);
  const highPeakMax = percentile(midis, 1);
  const extrema = buildExtrema(noteDistribution);

  return {
    absolute_range: midiRange(minMidi, maxMidi),
    real_range: midiRange(minMidi, maxMidi),
    detected_range: midiRange(minMidi, maxMidi),
    dominant_range: dominantRange,
    musical_range: musicalRange,
    musical_range_margin_semitones: MUSICAL_RANGE_MARGIN_SEMITONES,
    comfort_range: midiRange(comfortMin, comfortMax),
    stress_range: {
      low: midiRange(lowStressMin, lowStressMax),
      high: midiRange(highStressMin, highStressMax),
    },
    peak_range: {
      low: midiRange(lowPeakMin, lowPeakMax),
      high: midiRange(highPeakMin, highPeakMax),
    },
    peak_notes: buildPeakNotes(noteDistribution, musicalRange),
    ...extrema,
    note_distribution: noteDistribution,
    tessitura_score: calculateTessituraScore(notes, comfortMin, comfortMax, minMidi, maxMidi),
  };
}

function buildInsights(notes: PitchNote[], voice: string, payload?: Partial<YinPayload>) {
  const rawMidis = notes.map((n) => Math.round(n.pitch_midi)).filter(Number.isFinite);
  const rawDetectedMin = percentile(rawMidis, 0);
  const rawDetectedMax = percentile(rawMidis, 1);
  const filtered = filterPitchNotesForVoice(notes, voice);
  const sourceNotes = filtered.notes;
  const midis = sourceNotes.map((n) => Math.round(n.pitch_midi));

  const realMinMidi = percentile(midis, 0);
  const realMaxMidi = percentile(midis, 1);
  const robustMinMidi = percentile(midis, 0.03);
  const robustMaxMidi = percentile(midis, 0.97);
  const comfortMin = percentile(midis, 0.2);
  const comfortMax = percentile(midis, 0.8);
  const dominant = buildFallbackDominant(midis);
  const confidence = sourceNotes.length ? sourceNotes.reduce((sum, n) => sum + n.confidence, 0) / sourceNotes.length : 0;
  const contour = sourceNotes.slice(0, 4000).map((n) => ({ t: Number(n.start_s.toFixed(3)), midi: Math.round(n.pitch_midi), note: midiToNoteName(n.pitch_midi) }));
  const occasionalPeaks = sourceNotes
    .filter((n) => (robustMinMidi !== null && n.pitch_midi <= robustMinMidi - 1) || (robustMaxMidi !== null && n.pitch_midi >= robustMaxMidi + 1))
    .slice(0, 200)
    .map((n) => ({ t: Number(n.start_s.toFixed(3)), midi: Math.round(n.pitch_midi), note: midiToNoteName(n.pitch_midi) }));

  const recommend = {
    comfortavel: { min_midi: comfortMin, max_midi: comfortMax },
    moderado: { min_midi: realMinMidi, max_midi: realMaxMidi },
    avancado: { min_midi: realMinMidi !== null ? realMinMidi - 2 : null, max_midi: realMaxMidi !== null ? realMaxMidi + 2 : null },
  };
  const musicalLayers = buildMusicalLayers(sourceNotes, midis, comfortMin, comfortMax, realMinMidi, realMaxMidi, filtered.voiceRange);
  const analysisDebug = {
    raw_detected_min: rawDetectedMin,
    raw_detected_max: rawDetectedMax,
    raw_detected_min_note: isNumber(rawDetectedMin) ? midiToNoteName(rawDetectedMin) : null,
    raw_detected_max_note: isNumber(rawDetectedMax) ? midiToNoteName(rawDetectedMax) : null,
    filtered_detected_min: realMinMidi,
    filtered_detected_max: realMaxMidi,
    filtered_detected_min_note: isNumber(realMinMidi) ? midiToNoteName(realMinMidi) : null,
    filtered_detected_max_note: isNumber(realMaxMidi) ? midiToNoteName(realMaxMidi) : null,
    robust_detected_min: robustMinMidi,
    robust_detected_max: robustMaxMidi,
    robust_detected_min_note: isNumber(robustMinMidi) ? midiToNoteName(robustMinMidi) : null,
    robust_detected_max_note: isNumber(robustMaxMidi) ? midiToNoteName(robustMaxMidi) : null,
    voice_range: midiRange(filtered.voiceRange.min, filtered.voiceRange.max),
    min_confidence: MIN_PITCH_CONFIDENCE,
    min_sustained_note_ms: MIN_SUSTAINED_NOTE_MS,
    dominant_coverage_ratio: DOMINANT_COVERAGE_RATIO,
    musical_range_margin_semitones: MUSICAL_RANGE_MARGIN_SEMITONES,
    detector_reported_min_midi: payload?.detected_min_midi ?? null,
    detector_reported_max_midi: payload?.detected_max_midi ?? null,
  };

  return {
    minMidi: realMinMidi,
    maxMidi: realMaxMidi,
    comfortMin,
    comfortMax,
    dominant,
    confidence: Number(confidence.toFixed(4)),
    contour,
    occasionalPeaks,
    recommend,
    musicalLayers,
    filterStats: filtered.stats,
    analysisDebug,
    reliableNotes: sourceNotes.length,
  };
}

async function runLibrosaPitchAnalysis(sourcePath: string) {
  const analysisMode = "librosa-yin-full-audio";
  const scriptPath = join(process.cwd(), "scripts", "analyze_yin.py");
  const startedAt = Date.now();

  const { stdout } = await runSubprocess("python", [scriptPath, sourcePath], ANALYSIS_TIMEOUT_MS, "librosa-yin-full-audio");
  const payload = JSON.parse(stdout) as YinPayload;

  console.info("[audio-analysis-worker] librosa end", {
    analysis_mode: analysisMode,
    elapsed_ms: Date.now() - startedAt,
    frames: payload.frames,
    voiced_frames: payload.voiced_frames,
    detected_min_midi: payload.detected_min_midi,
    detected_max_midi: payload.detected_max_midi,
    memory: currentMemorySnapshot(),
  });

  return { ...payload, elapsedMs: Date.now() - startedAt, analysisMode };
}

async function preprocessAudioWithFfmpeg(inputPath: string, outputPath: string) {
  const startedAt = Date.now();
  const args = ["-y", "-i", inputPath, "-ac", "1", "-ar", String(ANALYSIS_SAMPLE_RATE)];
  if (ANALYSIS_MAX_SECONDS > 0) args.push("-t", String(ANALYSIS_MAX_SECONDS));
  args.push("-af", "highpass=f=80,lowpass=f=1200", outputPath);

  console.info("[audio-analysis-worker] preprocess start", {
    input: inputPath,
    output: outputPath,
    sample_rate: ANALYSIS_SAMPLE_RATE,
    max_seconds: ANALYSIS_MAX_SECONDS > 0 ? ANALYSIS_MAX_SECONDS : "full-audio",
    filter: "highpass=f=80,lowpass=f=1200",
    timeout_ms: FFMPEG_TIMEOUT_MS,
    memory: currentMemorySnapshot(),
  });

  await runSubprocess("ffmpeg", args, FFMPEG_TIMEOUT_MS, "ffmpeg-preprocess");
  return Date.now() - startedAt;
}

async function processJob(job: any) {
  const jobStartedAt = Date.now();
  const workspace = await mkdtemp(join(tmpdir(), `analysis-${job.id}-`));
  const sourcePath = join(workspace, "source.audio");
  const optimizedWavPath = join(workspace, "optimized.wav");
  const logs: Array<Record<string, unknown>> = [];

  logs.push({ at: new Date().toISOString(), message: "Worker de tessitura iniciado", pipeline: "ffmpeg-full-audio -> librosa.yin", max_seconds: ANALYSIS_MAX_SECONDS > 0 ? ANALYSIS_MAX_SECONDS : "full-audio" });
  const heartbeat = setInterval(() => {
    void supabase.from("audio_analysis_jobs").update({ updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "processing");
  }, HEARTBEAT_INTERVAL_MS);

  try {
    if (!job.source_r2_key) throw new Error("Job sem source_r2_key.");
    await downloadFromR2(job.source_r2_key, sourcePath);
    logs.push({ at: new Date().toISOString(), message: "Download do áudio concluído", source_r2_key: job.source_r2_key });

    const normalizedVoice = normalizeVoice(job.voice);
    if (IGNORED_ANALYSIS_LABELS.has(normalizedVoice)) throw new Error(`voice '${normalizedVoice}' não é elegível para análise de tessitura`);
    if (!DIRECT_VOICES.has(normalizedVoice)) throw new Error(`Voice inválida para análise de tessitura: ${String(job.voice ?? "")}`);

    const ffmpegElapsedMs = await preprocessAudioWithFfmpeg(sourcePath, optimizedWavPath);
    logs.push({ at: new Date().toISOString(), message: "Pré-processamento do áudio completo concluído", ffmpeg_elapsed_ms: ffmpegElapsedMs, output_format: "wav" });

    const analysisResult = await runLibrosaPitchAnalysis(optimizedWavPath);
    const { notes, avg_pitch_midi, elapsedMs: analysisElapsedMs, analysisMode } = analysisResult;
    const insights = buildInsights(notes, normalizedVoice, analysisResult);

    logs.push({ at: new Date().toISOString(), message: "Análise de tessitura concluída", analysis_mode: analysisMode, voice: normalizedVoice, notes_detected: notes.length, reliable_notes: insights.reliableNotes, filter_stats: insights.filterStats, absolute_range: insights.musicalLayers.absolute_range, dominant_range: insights.musicalLayers.dominant_range, musical_range: insights.musicalLayers.musical_range, tessitura_score: insights.musicalLayers.tessitura_score, avg_pitch_midi, analysis_elapsed_ms: analysisElapsedMs });

    if (insights.minMidi === null || insights.maxMidi === null) throw new Error("no pitch detected after vocal filters");

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
          musical_layers: insights.musicalLayers,
          filter_stats: insights.filterStats,
          analysis_debug: insights.analysisDebug,
        },
        analysis_logs: logs,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (error) throw new Error(error.message);
    console.info("[audio-analysis-worker] análise concluída", { job_id: job.id, analysis_mode: analysisMode, voice: normalizedVoice, detected_range: [insights.minMidi, insights.maxMidi], comfort_range: [insights.comfortMin, insights.comfortMax], musical_range: insights.musicalLayers.musical_range, filter_stats: insights.filterStats, tessitura_score: insights.musicalLayers.tessitura_score, elapsed_ms: Date.now() - jobStartedAt, memory: currentMemorySnapshot() });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    let message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("timed out") || message.toLowerCase().includes("timeout")) message = `timeout: ${message}`;
    if (err?.code === "ENOMEM" || message.toLowerCase().includes("out of memory")) message = `memory: ${message}`;
    logs.push({ at: new Date().toISOString(), message: "Falha no processamento", error: message });
    console.error("[audio-analysis-worker] falha ao processar job", { job_id: job.id, voice: job.voice ?? null, elapsed_ms: Date.now() - jobStartedAt, error: message, memory: currentMemorySnapshot() });

    await supabase.from("audio_analysis_jobs").update({ status: "failed", error_message: message, analysis_logs: logs, completed_at: new Date().toISOString() }).eq("id", job.id);
  } finally {
    clearInterval(heartbeat);
    await Promise.allSettled([unlink(sourcePath), unlink(optimizedWavPath), rm(workspace, { recursive: true, force: true })]);
  }
}

async function main() {
  const configuredMax = Number(process.env.MAX_CONCURRENT_ANALYSIS ?? "1");
  if (configuredMax !== MAX_CONCURRENT_ANALYSIS) {
    console.warn("[audio-analysis-worker] MAX_CONCURRENT_ANALYSIS inválido para este worker; forçando execução serial", { configured: configuredMax, enforced: MAX_CONCURRENT_ANALYSIS });
  }
  console.info("[audio-analysis-worker] started", { ENABLE_SMART_TESSITURA_ANALYSIS, MAX_CONCURRENT_ANALYSIS, analysis_pipeline: "ffmpeg-full-audio -> librosa-yin", analysis_max_seconds: ANALYSIS_MAX_SECONDS > 0 ? ANALYSIS_MAX_SECONDS : "full-audio", analysis_sample_rate: ANALYSIS_SAMPLE_RATE, analysis_timeout_ms: ANALYSIS_TIMEOUT_MS, min_pitch_confidence: MIN_PITCH_CONFIDENCE, min_sustained_note_ms: MIN_SUSTAINED_NOTE_MS, musical_range_margin_semitones: MUSICAL_RANGE_MARGIN_SEMITONES, memory: currentMemorySnapshot() });

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
