import { getSignedSemitoneDistance, normalizeTone, toneToSemitone } from "@/lib/music/tones";

export type VocalRangeType = "tenor" | "contralto" | "soprano" | "baritono";

export interface VocalRange {
  type: VocalRangeType;
  label: string;
  comfortableMinMidi: number;
  comfortableMaxMidi: number;
  absoluteMinMidi: number;
  absoluteMaxMidi: number;
  preferredOctaveShift: 0 | -12 | 12;
}

export interface TessituraAnalysis {
  requestedTone: string;
  sourceTone: string;
  semitoneShift: number;
  targetMidiRange: {
    min: number;
    max: number;
  };
  status: "comfortable" | "warning" | "unsafe";
  suggestedRange: VocalRangeType;
  suggestedOctaveShift: 0 | -12 | 12;
  message: string;
}

export const VOCAL_RANGES: Record<VocalRangeType, VocalRange> = {
  baritono: {
    type: "baritono",
    label: "Barítono",
    comfortableMinMidi: 45,
    comfortableMaxMidi: 64,
    absoluteMinMidi: 40,
    absoluteMaxMidi: 67,
    preferredOctaveShift: 0,
  },
  tenor: {
    type: "tenor",
    label: "Tenor",
    comfortableMinMidi: 48,
    comfortableMaxMidi: 67,
    absoluteMinMidi: 43,
    absoluteMaxMidi: 72,
    preferredOctaveShift: 0,
  },
  contralto: {
    type: "contralto",
    label: "Contralto",
    comfortableMinMidi: 53,
    comfortableMaxMidi: 74,
    absoluteMinMidi: 48,
    absoluteMaxMidi: 77,
    preferredOctaveShift: 0,
  },
  soprano: {
    type: "soprano",
    label: "Soprano",
    comfortableMinMidi: 60,
    comfortableMaxMidi: 81,
    absoluteMinMidi: 55,
    absoluteMaxMidi: 84,
    preferredOctaveShift: 0,
  },
};

const TONE_TO_MIDI_BASE: Record<string, number> = {
  C: 60,
  "C#": 61,
  D: 62,
  "D#": 63,
  E: 64,
  F: 65,
  "F#": 66,
  G: 67,
  "G#": 68,
  A: 69,
  "A#": 70,
  B: 71,
};

export function toneToMidi(value: string, octave = 4): number | null {
  const normalized = normalizeTone(value);
  if (!normalized) return null;
  const base = TONE_TO_MIDI_BASE[normalized];
  if (typeof base !== "number") return null;
  return base + (octave - 4) * 12;
}

export function applySemitoneShift(midi: number, semitoneShift: number, octaveShift: number = 0) {
  return midi + semitoneShift + octaveShift;
}

export function classifyRange(minMidi: number, maxMidi: number): {
  status: "comfortable" | "warning" | "unsafe";
  suggestedRange: VocalRange;
} {
  const ranges = Object.values(VOCAL_RANGES);

  for (const range of ranges) {
    if (minMidi >= range.comfortableMinMidi && maxMidi <= range.comfortableMaxMidi) {
      return {
        status: "comfortable",
        suggestedRange: range,
      };
    }
  }

  for (const range of ranges) {
    if (minMidi >= range.absoluteMinMidi && maxMidi <= range.absoluteMaxMidi) {
      return {
        status: "warning",
        suggestedRange: range,
      };
    }
  }

  return {
    status: "unsafe",
    suggestedRange: VOCAL_RANGES.tenor,
  };
}

export function analyzeTessitura({
  requestedTone,
  sourceTone,
  sourceMinMidi,
  sourceMaxMidi,
}: {
  requestedTone: string;
  sourceTone: string;
  sourceMinMidi: number;
  sourceMaxMidi: number;
}): TessituraAnalysis | null {
  const semitoneShift = getSignedSemitoneDistance(sourceTone, requestedTone);
  if (semitoneShift === null) return null;

  const shiftedMin = applySemitoneShift(sourceMinMidi, semitoneShift);
  const shiftedMax = applySemitoneShift(sourceMaxMidi, semitoneShift);

  const classification = classifyRange(shiftedMin, shiftedMax);

  let octaveShift: 0 | -12 | 12 = 0;

  if (classification.status === "unsafe") {
    if (shiftedMax > VOCAL_RANGES.soprano.absoluteMaxMidi) {
      octaveShift = -12;
    }

    if (shiftedMin < VOCAL_RANGES.baritono.absoluteMinMidi) {
      octaveShift = 12;
    }
  }

  const adjustedMin = shiftedMin + octaveShift;
  const adjustedMax = shiftedMax + octaveShift;

  const adjustedClassification = classifyRange(adjustedMin, adjustedMax);

  return {
    requestedTone,
    sourceTone,
    semitoneShift,
    targetMidiRange: {
      min: adjustedMin,
      max: adjustedMax,
    },
    status: adjustedClassification.status,
    suggestedRange: adjustedClassification.suggestedRange.type,
    suggestedOctaveShift: octaveShift,
    message:
      octaveShift === -12
        ? "Tessitura elevada detectada. Recomendada reprodução 1 oitava abaixo."
        : octaveShift === 12
          ? "Tessitura muito grave detectada. Recomendada reprodução 1 oitava acima."
          : adjustedClassification.status === "comfortable"
            ? "Tessitura confortável para o nipe sugerido."
            : adjustedClassification.status === "warning"
              ? "Tessitura utilizável, mas próxima do limite confortável."
              : "Tessitura fora da zona recomendada.",
  };
}
