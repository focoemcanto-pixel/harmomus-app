import { midiToBrazilianNote } from "@/lib/music-notes";
import { getVocalProfile, type VocalProfileType } from "@/lib/vocal-profiles";

export type RecommendationRisk = "ideal" | "comfortable_limit" | "reorganization_recommended" | "incomplete";
export type TessituraOverflowDirection = "high" | "low" | "both" | "none";

export interface NoteDistributionEntry {
  midi: number;
  note?: string;
  duration_s?: number;
  duration_ratio?: number;
  occurrences?: number;
}

export interface ToneRecommendationInput {
  voiceType: VocalProfileType | string;
  detectedMinMidi?: number | null;
  detectedMaxMidi?: number | null;
  comfortMinMidi?: number | null;
  comfortMaxMidi?: number | null;
  peakMaxMidi?: number | null;
  noteDistribution?: NoteDistributionEntry[] | null;
}

export interface ToneRecommendation {
  risk: RecommendationRisk;
  label: string;
  explanation: string;
  overflowSemitones: number;
  overflowDirection: TessituraOverflowDirection;
  redistributionActions: string[];
  display: {
    detectedRange: string;
    comfortRange: string;
    profileComfortRange: string;
  };
}

const INCOMPLETE_RANGE = "— → —";
const STRUCTURAL_PRESSURE_RATIO = 0.12;
const WARNING_PRESSURE_RATIO = 0.04;
const LOW_PRESSURE_TOLERANCE_RATIO = 0.18;

const RECOMMENDATION_PRIORITY: Record<RecommendationRisk, number> = {
  reorganization_recommended: 3,
  comfortable_limit: 2,
  ideal: 1,
  incomplete: 0,
};

const HIGH_REDISTRIBUTION_RULES: Record<VocalProfileType, string[]> = {
  soprano: [
    "Soprano deve testar a linha do contralto neste tom, porque a linha original ficou alta demais para sustentar com conforto.",
    "Se o contralto também estiver pressionado, revisar o tom geral da música antes de redistribuir o coral inteiro.",
  ],
  contralto: [
    "Contralto deve testar a linha do tenor neste tom, porque a linha original passou da região confortável.",
    "Validar se a função harmônica continua clara ao deslocar o contralto para a linha do tenor.",
  ],
  tenor: ["Tenor deve testar a linha do soprano uma oitava abaixo neste tom, porque a linha original ficou alta demais para sustentar."],
};

const LOW_REDISTRIBUTION_RULES: Record<VocalProfileType, string[]> = {
  soprano: [
    "A linha está baixa para soprano, mas isso só exige reorganização se houver perda de projeção, brilho ou afinação no ensaio.",
    "Antes de trocar de nipe, verificar se a região baixa é pontual ou estrutural no arranjo.",
  ],
  contralto: [
    "A linha está baixa para contralto, mas pode ser musicalmente aceitável se estiver confortável e afinada.",
    "Se houver peso excessivo, testar a linha do soprano ou revisar o tom geral.",
  ],
  tenor: [
    "A linha está baixa para tenor; se perder presença, testar a linha do contralto ou a do soprano uma oitava abaixo conforme a função harmônica.",
  ],
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatRange(min?: number | null, max?: number | null) {
  if (!isNumber(min) || !isNumber(max)) return INCOMPLETE_RANGE;
  return `${midiToBrazilianNote(min)} → ${midiToBrazilianNote(max)}`;
}

function buildDisplay(input: ToneRecommendationInput) {
  const profile = getVocalProfile(input.voiceType);

  return {
    detectedRange: formatRange(input.detectedMinMidi, input.detectedMaxMidi),
    comfortRange: formatRange(input.comfortMinMidi, input.comfortMaxMidi),
    profileComfortRange: profile ? formatRange(profile.comfortMinMidi, profile.comfortMaxMidi) : INCOMPLETE_RANGE,
  };
}

function buildIncompleteRecommendation(input: ToneRecommendationInput): ToneRecommendation {
  return {
    risk: "incomplete",
    label: "⚪ Análise incompleta",
    explanation: "A Harmomus IA ainda não tem min/max e região confortável suficientes para validar este nipe.",
    overflowSemitones: 0,
    overflowDirection: "none",
    redistributionActions: ["Reanalisar a Tessitura IA antes de decidir redistribuição vocal."],
    display: buildDisplay(input),
  };
}

function getOverflowDirection(belowComfort: number, aboveComfort: number): TessituraOverflowDirection {
  if (belowComfort > 0 && aboveComfort > 0) return "both";
  if (aboveComfort > 0) return "high";
  if (belowComfort > 0) return "low";
  return "none";
}

function getRedistributionActions(voice: VocalProfileType, direction: TessituraOverflowDirection) {
  if (direction === "high") return HIGH_REDISTRIBUTION_RULES[voice];
  if (direction === "low") return LOW_REDISTRIBUTION_RULES[voice];
  if (direction === "both") {
    return [
      "A linha pressiona conforto nas duas extremidades; revisar condução do nipe antes de qualquer mudança automática.",
      ...HIGH_REDISTRIBUTION_RULES[voice],
      ...LOW_REDISTRIBUTION_RULES[voice],
    ];
  }
  return [];
}

function normalizeDistribution(entries?: NoteDistributionEntry[] | null) {
  if (!Array.isArray(entries)) return [];
  const cleaned = entries
    .filter((entry) => isNumber(entry.midi))
    .map((entry) => ({
      midi: Math.round(entry.midi),
      durationRatio: isNumber(entry.duration_ratio) ? Math.max(0, entry.duration_ratio) : 0,
      durationSeconds: isNumber(entry.duration_s) ? Math.max(0, entry.duration_s) : 0,
    }));

  const ratioTotal = cleaned.reduce((sum, entry) => sum + entry.durationRatio, 0);
  if (ratioTotal > 0) {
    return cleaned.map((entry) => ({ ...entry, durationRatio: entry.durationRatio / ratioTotal }));
  }

  const secondsTotal = cleaned.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  if (secondsTotal > 0) {
    return cleaned.map((entry) => ({ ...entry, durationRatio: entry.durationSeconds / secondsTotal }));
  }

  return cleaned;
}

function getWeightedPressure(input: ToneRecommendationInput, profile: NonNullable<ReturnType<typeof getVocalProfile>>) {
  const distribution = normalizeDistribution(input.noteDistribution);

  if (distribution.length === 0) {
    const belowComfort = Math.max(0, profile.comfortMinMidi - (input.comfortMinMidi ?? profile.comfortMinMidi));
    const aboveComfort = Math.max(0, (input.comfortMaxMidi ?? profile.comfortMaxMidi) - profile.comfortMaxMidi);
    return {
      belowComfort,
      aboveComfort,
      belowPressureRatio: belowComfort > 0 ? 1 : 0,
      abovePressureRatio: aboveComfort > 0 ? 1 : 0,
      peakHighMidi: input.peakMaxMidi ?? input.detectedMaxMidi ?? null,
      peakHighRatio: 0,
    };
  }

  const highNotes = distribution.filter((entry) => entry.midi > profile.comfortMaxMidi);
  const lowNotes = distribution.filter((entry) => entry.midi < profile.comfortMinMidi);
  const abovePressureRatio = highNotes.reduce((sum, entry) => sum + entry.durationRatio, 0);
  const belowPressureRatio = lowNotes.reduce((sum, entry) => sum + entry.durationRatio, 0);
  const highestStructural = highNotes
    .filter((entry) => entry.durationRatio >= WARNING_PRESSURE_RATIO)
    .sort((a, b) => b.midi - a.midi)[0];
  const lowestStructural = lowNotes
    .filter((entry) => entry.durationRatio >= LOW_PRESSURE_TOLERANCE_RATIO)
    .sort((a, b) => a.midi - b.midi)[0];
  const peakHigh = distribution.sort((a, b) => b.midi - a.midi)[0];

  return {
    belowComfort: lowestStructural ? Math.max(0, profile.comfortMinMidi - lowestStructural.midi) : 0,
    aboveComfort: highestStructural ? Math.max(0, highestStructural.midi - profile.comfortMaxMidi) : 0,
    belowPressureRatio,
    abovePressureRatio,
    peakHighMidi: peakHigh?.midi ?? input.peakMaxMidi ?? input.detectedMaxMidi ?? null,
    peakHighRatio: peakHigh?.durationRatio ?? 0,
  };
}

export function getRecommendationPriority(risk: RecommendationRisk) {
  return RECOMMENDATION_PRIORITY[risk] ?? 0;
}

export function calculateToneRecommendation(input: ToneRecommendationInput): ToneRecommendation {
  const profile = getVocalProfile(input.voiceType);
  const display = buildDisplay(input);

  if (
    !profile ||
    !isNumber(input.detectedMinMidi) ||
    !isNumber(input.detectedMaxMidi) ||
    !isNumber(input.comfortMinMidi) ||
    !isNumber(input.comfortMaxMidi)
  ) {
    return { ...buildIncompleteRecommendation(input), display };
  }

  const pressure = getWeightedPressure(input, profile);
  const absoluteHighOver = Math.max(0, Math.max(input.detectedMaxMidi, pressure.peakHighMidi ?? input.detectedMaxMidi) - profile.absoluteMaxMidi);
  const absoluteLowUnder = Math.max(0, profile.absoluteMinMidi - input.detectedMinMidi);
  const hasStructuralHighPressure = pressure.abovePressureRatio >= STRUCTURAL_PRESSURE_RATIO || pressure.aboveComfort > profile.warningMargin;
  const hasWarningHighPressure = pressure.abovePressureRatio >= WARNING_PRESSURE_RATIO || pressure.aboveComfort > 0;
  const hasStructuralLowPressure = pressure.belowPressureRatio >= LOW_PRESSURE_TOLERANCE_RATIO && pressure.belowComfort > profile.warningMargin;
  const hasWarningLowPressure = pressure.belowPressureRatio >= LOW_PRESSURE_TOLERANCE_RATIO && pressure.belowComfort > 0;
  const belowComfort = hasStructuralLowPressure || hasWarningLowPressure ? pressure.belowComfort : 0;
  const aboveComfort = hasStructuralHighPressure || hasWarningHighPressure ? pressure.aboveComfort : 0;
  const overflowSemitones = Math.max(absoluteHighOver, absoluteLowUnder, belowComfort, aboveComfort);
  const overflowDirection = getOverflowDirection(belowComfort || absoluteLowUnder, aboveComfort || absoluteHighOver);
  const directionText = overflowDirection === "high" ? "acima" : overflowDirection === "low" ? "abaixo" : "fora";

  if (absoluteHighOver > 0 || absoluteLowUnder > 0 || hasStructuralHighPressure || hasStructuralLowPressure) {
    return {
      risk: "reorganization_recommended",
      label: "🔴 Reorganização recomendada",
      explanation:
        absoluteHighOver > 0 || absoluteLowUnder > 0
          ? `A linha passa da extensão segura do ${profile.label.toLowerCase()}; a Harmomus IA recomenda redistribuição vocal textual, sem alterar áudio, player ou tom.`
          : `A linha sustenta pressão ${directionText} da região confortável do ${profile.label.toLowerCase()} por tempo relevante no arranjo.`,
      overflowSemitones,
      overflowDirection,
      redistributionActions: getRedistributionActions(profile.type, overflowDirection),
      display,
    };
  }

  if (hasWarningHighPressure || hasWarningLowPressure) {
    return {
      risk: "comfortable_limit",
      label: "🟡 Limite confortável",
      explanation: `A linha encosta no limite confortável do ${profile.label.toLowerCase()}, mas a pressão parece pontual ou curta; validar no ensaio antes de redistribuir.`,
      overflowSemitones,
      overflowDirection,
      redistributionActions: ["Manter a linha original por enquanto e observar fadiga, afinação e emissão no ensaio."],
      display,
    };
  }

  return {
    risk: "ideal",
    label: "🟢 Ideal",
    explanation: `A linha fica dentro da região confortável do ${profile.label.toLowerCase()} ou possui apenas picos curtos sem pressão estrutural.`,
    overflowSemitones,
    overflowDirection,
    redistributionActions: ["Manter distribuição vocal original."],
    display,
  };
}
