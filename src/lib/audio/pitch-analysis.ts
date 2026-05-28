import { midiToBrazilianNote, midiToNoteName, spnToBrazilianNote } from "@/lib/music/notes";

export { midiToBrazilianNote, midiToNoteName, spnToBrazilianNote };

export interface PitchAnalysisFrame {
  time: number;
  frequency: number;
  midi: number;
  confidence: number;
}

export interface PitchAnalysisResult {
  minMidiNote: number | null;
  maxMidiNote: number | null;
  medianMidiNote: number | null;
  confidence: number;
  frames: PitchAnalysisFrame[];
}

const MIN_FREQUENCY = 70;
const MAX_FREQUENCY = 1200;
const DEFAULT_WINDOW_SIZE = 4096;
const DEFAULT_HOP_SIZE = 2048;
const MIN_CONFIDENCE = 0.72;
const MAX_MELODY_JUMP_SEMITONES = 7;
const MIN_NOTE_OCCURRENCE_RATIO = 0.018;
const MIN_MELODY_FRAMES = 8;

export function frequencyToMidi(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

function detectPitchByAutocorrelation(buffer: Float32Array, sampleRate: number): { frequency: number; confidence: number } | null {
  const volume = rms(buffer);
  if (volume < 0.01) return null;

  const minLag = Math.floor(sampleRate / MAX_FREQUENCY);
  const maxLag = Math.min(buffer.length - 1, Math.ceil(sampleRate / MIN_FREQUENCY));

  let bestLag = -1;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;

    for (let i = 0; i < buffer.length - lag; i += 1) {
      const a = buffer[i];
      const b = buffer[i + lag];
      correlation += a * b;
      energyA += a * a;
      energyB += b * b;
    }

    const normalized = correlation / Math.sqrt(energyA * energyB || 1);
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorrelation < MIN_CONFIDENCE) return null;

  return {
    frequency: sampleRate / bestLag,
    confidence: Math.max(0, Math.min(1, bestCorrelation)),
  };
}

function extractMonoSamples(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);

  const length = audioBuffer.length;
  const output = new Float32Array(length);

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      output[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }

  return output;
}

function percentile(values: number[], ratio: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

function smoothMelodyFrames(frames: PitchAnalysisFrame[]): PitchAnalysisFrame[] {
  if (frames.length < 3) return frames;

  return frames.map((frame, index) => {
    const window = frames.slice(Math.max(0, index - 1), Math.min(frames.length, index + 2));
    const midi = median(window.map((item) => item.midi)) ?? frame.midi;
    const frequency = midiToFrequency(midi);

    return {
      ...frame,
      midi,
      frequency,
    };
  });
}

function removeUnrealisticMelodyJumps(frames: PitchAnalysisFrame[]): PitchAnalysisFrame[] {
  if (frames.length < 2) return frames;

  const result: PitchAnalysisFrame[] = [];
  let previous: PitchAnalysisFrame | null = null;

  for (const frame of frames) {
    if (!previous) {
      result.push(frame);
      previous = frame;
      continue;
    }

    const jump = Math.abs(frame.midi - previous.midi);
    if (jump <= MAX_MELODY_JUMP_SEMITONES || frame.confidence > 0.9) {
      result.push(frame);
      previous = frame;
    }
  }

  return result;
}

function keepDenseMelodyNotes(frames: PitchAnalysisFrame[]): PitchAnalysisFrame[] {
  if (frames.length < MIN_MELODY_FRAMES) return frames;

  const counts = new Map<number, number>();
  for (const frame of frames) {
    counts.set(frame.midi, (counts.get(frame.midi) ?? 0) + 1);
  }

  const minCount = Math.max(2, Math.ceil(frames.length * MIN_NOTE_OCCURRENCE_RATIO));

  return frames.filter((frame) => {
    const directCount = counts.get(frame.midi) ?? 0;
    const neighborCount = (counts.get(frame.midi - 1) ?? 0) + directCount + (counts.get(frame.midi + 1) ?? 0);
    return directCount >= minCount || neighborCount >= minCount + 1;
  });
}

function extractVocalMelodyFrames(frames: PitchAnalysisFrame[]): PitchAnalysisFrame[] {
  const confidentFrames = frames.filter((frame) => frame.confidence >= MIN_CONFIDENCE);
  if (confidentFrames.length < MIN_MELODY_FRAMES) return confidentFrames;

  const smoothed = smoothMelodyFrames(confidentFrames);
  const continuous = removeUnrealisticMelodyJumps(smoothed);
  const dense = keepDenseMelodyNotes(continuous);

  return dense.length >= MIN_MELODY_FRAMES ? dense : continuous;
}

export async function analyzeAudioBufferPitch(audioBuffer: AudioBuffer): Promise<PitchAnalysisResult> {
  const samples = extractMonoSamples(audioBuffer);
  const frames: PitchAnalysisFrame[] = [];

  for (let offset = 0; offset + DEFAULT_WINDOW_SIZE <= samples.length; offset += DEFAULT_HOP_SIZE) {
    const slice = samples.slice(offset, offset + DEFAULT_WINDOW_SIZE);
    const detected = detectPitchByAutocorrelation(slice, audioBuffer.sampleRate);
    if (!detected) continue;

    const midi = frequencyToMidi(detected.frequency);
    frames.push({
      time: offset / audioBuffer.sampleRate,
      frequency: detected.frequency,
      midi,
      confidence: detected.confidence,
    });
  }

  const melodyFrames = extractVocalMelodyFrames(frames);
  const midiValues = melodyFrames.map((frame) => frame.midi);

  const minMidi = percentile(midiValues, 0.08);
  const maxMidi = percentile(midiValues, 0.92);
  const medianMidi = percentile(midiValues, 0.5);
  const confidence = melodyFrames.length > 0
    ? melodyFrames.reduce((sum, frame) => sum + frame.confidence, 0) / melodyFrames.length
    : 0;

  return {
    minMidiNote: minMidi,
    maxMidiNote: maxMidi,
    medianMidiNote: medianMidi,
    confidence: Number(confidence.toFixed(4)),
    frames: melodyFrames,
  };
}

export async function analyzeAudioUrlPitch(url: string): Promise<PitchAnalysisResult> {
  if (typeof window === "undefined") {
    throw new Error("A análise automática de pitch precisa rodar no navegador.");
  }

  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Este navegador não suporta WebAudio.");
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível carregar o áudio para análise.");

  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new AudioContextClass();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return await analyzeAudioBufferPitch(audioBuffer);
  } finally {
    await audioContext.close().catch(() => undefined);
  }
}
