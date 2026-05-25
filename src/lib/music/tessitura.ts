import { getSignedSemitoneDistance, normalizeTone } from "@/lib/music/tones";

export type VocalRangeType = "tenor" | "contralto" | "soprano" | "baritono";
export type TessituraStatus = "comfortable" | "extended" | "extreme" | "unsafe";

export interface VocalZone {
  minMidi: number;
  maxMidi: number;
}

export interface VocalRange {
  type: VocalRangeType;
  label: string;
  comfortable: VocalZone;
  extended: VocalZone;
  extreme: VocalZone;
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
  status: TessituraStatus;
  suggestedRange: VocalRangeType;
  suggestedOctaveShift: 0 | -12 | 12;
  message: string;
}

export interface TargetVoiceTessituraAnalysis {
  requestedTone: string;
  sourceTone: string;
  semitoneShift: number;
  voice: VocalRangeType;
  targetMidiRange: {
    min: number;
    max: number;
  };
  status: TessituraStatus;
  suggestedOctaveShift: 0 | -12 | 12;
  message: string;
}

export const VOCAL_RANGES: Record<VocalRangeType, VocalRange> = {
  baritono: {
    type: "baritono",
    label: "Barítono",
    comfortable: {
      minMidi: 43,
      maxMidi: 62,
    },
    extended: {
      minMidi: 40,
      maxMidi: 65,
    },
    extreme: {
      minMidi: 38,
      maxMidi: 67,
    },
    preferredOctaveShift: 0,
  },

  tenor: {
    type: "tenor",
    label: "Tenor",
    comfortable: {
      minMidi: 48,
      maxMidi: 67,
    },
    extended: {
      minMidi: 45,
      maxMidi: 71,
    },
    extreme: {
      minMidi: 43,
      maxMidi: 74,
    },
    preferredOctaveShift: 0,
  },

  contralto: {
    type: "contralto",
    label: "Contralto",
    comfortable: {
      minMidi: 52,
      maxMidi: 72,
    },
    extended: {
      minMidi: 48,
      maxMidi: 76,
    },
    extreme: {
      minMidi: 45,
      maxMidi: 79,
    },
    preferredOctaveShift: 0,
  },

  soprano: {
    type: "soprano",
    label: "Soprano",
    comfortable: {
      minMidi: 57,
      maxMidi: 72,
    },
    extended: {
      minMidi: 55,
      maxMidi: 79,
    },
    extreme: {
      minMidi: 53,
      maxMidi: 84,
    },
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

function classifyAgainstRange(minMidi: number, maxMidi: number, range: VocalRange): TessituraStatus {
  if (minMidi >= range.comfortable.minMidi && maxMidi <= range.comfortable.maxMidi) return "comfortable";
  if (minMidi >= range.extended.minMidi && maxMidi <= range.extended.maxMidi) return "extended";
  if (minMidi >= range.extreme.minMidi && maxMidi <= range.extreme.maxMidi) return "extreme";
  return "unsafe";
}

export function classifyRange(minMidi: number, maxMidi: number): {
  status: TessituraStatus;
  suggestedRange: VocalRange;
} {
  const ranges = Object.values(VOCAL_RANGES);

  for (const range of ranges) {
    if (classifyAgainstRange(minMidi, maxMidi, range) === "comfortable") {
      return {
        status: "comfortable",
        suggestedRange: range,
      };
    }
  }

  for (const range of ranges) {
    if (classifyAgainstRange(minMidi, maxMidi, range) === "extended") {
      return {
        status: "extended",
        suggestedRange: range,
      };
    }
  }

  for (const range of ranges) {
    if (classifyAgainstRange(minMidi, maxMidi, range) === "extreme") {
      return {
        status: "extreme",
        suggestedRange: range,
      };
    }
  }

  return {
    status: "unsafe",
    suggestedRange: VOCAL_RANGES.tenor,
  };
}

export function analyzeTargetVoiceTessitura({
  requestedTone,
  sourceTone,
  sourceMinMidi,
  sourceMaxMidi,
  voice,
}: {
  requestedTone: string;
  sourceTone: string;
  sourceMinMidi: number;
  sourceMaxMidi: number;
  voice: VocalRangeType;
}): TargetVoiceTessituraAnalysis | null {
  const semitoneShift = getSignedSemitoneDistance(sourceTone, requestedTone);
  if (semitoneShift === null) return null;

  const range = VOCAL_RANGES[voice];
  const shiftedMin = applySemitoneShift(sourceMinMidi, semitoneShift);
  const shiftedMax = applySemitoneShift(sourceMaxMidi, semitoneShift);

  let octaveShift: 0 | -12 | 12 = 0;
  let status = classifyAgainstRange(shiftedMin, shiftedMax, range);

  if (status === "unsafe") {
    const octaveDownStatus = classifyAgainstRange(shiftedMin - 12, shiftedMax - 12, range);
    const octaveUpStatus = classifyAgainstRange(shiftedMin + 12, shiftedMax + 12, range);

    if (octaveDownStatus !== "unsafe" && shiftedMax > range.extreme.maxMidi) {
      octaveShift = -12;
      status = octaveDownStatus;
    } else if (octaveUpStatus !== "unsafe" && shiftedMin < range.extreme.minMidi) {
      octaveShift = 12;
      status = octaveUpStatus;
    }
  }

  const adjustedMin = shiftedMin + octaveShift;
  const adjustedMax = shiftedMax + octaveShift;

  const messageMap: Record<TessituraStatus, string> = {
    comfortable: `Tessitura confortável para ${range.label}.`,
    extended: `Tessitura utilizável para ${range.label}, mas fora da zona principal de conforto.`,
    extreme: `Tessitura extrema para ${range.label}. Exige maior técnica e controle vocal.`,
    unsafe: `Tessitura fora da região recomendada para ${range.label}.`,
  };

  return {
    requestedTone,
    sourceTone,
    semitoneShift,
    voice,
    targetMidiRange: {
      min: adjustedMin,
      max: adjustedMax,
    },
    status,
    suggestedOctaveShift: octaveShift,
    message:
      octaveShift === -12
        ? `A linha de ${range.label} ficou muito elevada. Recomendada leitura 1 oitava abaixo para esta função vocal.`
        : octaveShift === 12
          ? `A linha de ${range.label} ficou muito grave. Recomendada leitura 1 oitava acima para esta função vocal.`
          : messageMap[status],
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
    if (shiftedMax > VOCAL_RANGES.soprano.extreme.maxMidi) {
      octaveShift = -12;
    }

    if (shiftedMin < VOCAL_RANGES.baritono.extreme.minMidi) {
      octaveShift = 12;
    }
  }

  const adjustedMin = shiftedMin + octaveShift;
  const adjustedMax = shiftedMax + octaveShift;

  const adjustedClassification = classifyRange(adjustedMin, adjustedMax);

  const messageMap: Record<TessituraAnalysis["status"], string> = {
    comfortable: "Tessitura confortável para o nipe sugerido.",
    extended: "Tessitura utilizável, mas fora da zona principal de conforto.",
    extreme: "Tessitura extrema detectada. Requer maior técnica e controle vocal.",
    unsafe: "Tessitura fora da região segura recomendada.",
  };

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
        ? "Tessitura muito elevada detectada. Recomendada reprodução 1 oitava abaixo."
        : octaveShift === 12
          ? "Tessitura muito grave detectada. Recomendada reprodução 1 oitava acima."
          : messageMap[adjustedClassification.status],
  };
}
