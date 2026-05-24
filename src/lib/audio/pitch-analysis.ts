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

export function frequencyToMidi(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
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

  const confidentFrames = frames.filter((frame) => frame.confidence >= MIN_CONFIDENCE);
  const midiValues = confidentFrames.map((frame) => frame.midi);

  const minMidi = percentile(midiValues, 0.03);
  const maxMidi = percentile(midiValues, 0.97);
  const medianMidi = percentile(midiValues, 0.5);
  const confidence = confidentFrames.length > 0
    ? confidentFrames.reduce((sum, frame) => sum + frame.confidence, 0) / confidentFrames.length
    : 0;

  return {
    minMidiNote: minMidi,
    maxMidiNote: maxMidi,
    medianMidiNote: medianMidi,
    confidence: Number(confidence.toFixed(4)),
    frames: confidentFrames,
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
