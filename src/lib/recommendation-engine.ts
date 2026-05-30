import { midiToBrazilianNote } from "@/lib/music-notes";
import { getVocalProfile, type VocalProfileType } from "@/lib/vocal-profiles";

export type RecommendationRisk = "ideal" | "comfortable_limit" | "reorganization_recommended" | "incomplete";
export type TessituraOverflowDirection = "high" | "low" | "both" | "none";

export interface ToneRecommendationInput {
  voiceType: VocalProfileType | string;
  detectedMinMidi?: number | null;
  detectedMaxMidi?: number | null;
  comfortMinMidi?: number | null;
  comfortMaxMidi?: number | null;
  peakMaxMidi?: number | null;
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

const RECOMMENDATION_PRIORITY: Record<RecommendationRisk, number> = {
  reorganization_recommended: 3,
  comfortable_limit: 2,
  ideal: 1,
  incomplete: 0,
};

const HIGH_REDISTRIBUTION_RULES: Record<VocalProfileType, string[]> = {
  soprano: [
    "Soprano recebe a linha do contralto.",
    "Contralto recebe a linha do tenor.",
    "Tenor recebe a linha do soprano uma oitava abaixo.",
  ],
  contralto: [
    "Contralto recebe a linha do tenor.",
    "Avaliar a redistribuição correspondente entre soprano e tenor para manter a função harmônica.",
  ],
  tenor: ["Tenor recebe a linha do soprano uma oitava abaixo."],
};

const LOW_REDISTRIBUTION_RULES: Record<VocalProfileType, string[]> = {
  soprano: [
    "Soprano retoma uma linha mais aguda: avaliar a linha do tenor uma oitava acima.",
    "Tenor pode assumir a linha do contralto.",
    "Contralto pode assumir a linha do soprano, se a condução harmônica permitir.",
  ],
  contralto: [
    "Contralto retoma uma linha mais aguda: avaliar a linha do tenor uma oitava acima ou a linha do soprano.",
    "Tenor pode assumir a linha original do contralto quando a região baixa ficar pesada.",
  ],
  tenor: [
    "Tenor retoma uma linha mais aguda: avaliar a linha do contralto ou do soprano uma oitava abaixo conforme a função harmônica.",
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
      "A linha ultrapassa conforto nas duas extremidades; revisar condução do nipe antes de qualquer mudança de tom.",
      ...HIGH_REDISTRIBUTION_RULES[voice],
      ...LOW_REDISTRIBUTION_RULES[voice],
    ];
  }
  return [];
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

  const absoluteMaxToCheck = Math.max(input.detectedMaxMidi, input.comfortMaxMidi, isNumber(input.peakMaxMidi) ? input.peakMaxMidi : input.detectedMaxMidi);
  const outsideAbsolute = input.detectedMinMidi < profile.absoluteMinMidi || input.comfortMinMidi < profile.absoluteMinMidi || absoluteMaxToCheck > profile.absoluteMaxMidi;
  const belowComfort = Math.max(0, profile.comfortMinMidi - input.comfortMinMidi);
  const aboveComfort = Math.max(0, input.comfortMaxMidi - profile.comfortMaxMidi);
  const overflowSemitones = Math.max(belowComfort, aboveComfort);
  const overflowDirection = getOverflowDirection(belowComfort, aboveComfort);
  const directionText = overflowDirection === "high" ? "acima" : overflowDirection === "low" ? "abaixo" : "fora";

  if (outsideAbsolute || overflowSemitones > profile.warningMargin) {
    return {
      risk: "reorganization_recommended",
      label: "🔴 Reorganização recomendada",
      explanation: outsideAbsolute
        ? `A linha passa da extensão segura do ${profile.label.toLowerCase()}; a Harmomus IA recomenda redistribuição vocal textual, sem alterar áudio, player ou tom.`
        : `A linha ultrapassa ${overflowSemitones} semitom${overflowSemitones === 1 ? "" : "s"} ${directionText} da região confortável do ${profile.label.toLowerCase()}.`,
      overflowSemitones,
      overflowDirection,
      redistributionActions: getRedistributionActions(profile.type, overflowDirection),
      display,
    };
  }

  if (overflowSemitones > 0) {
    return {
      risk: "comfortable_limit",
      label: "🟡 Limite confortável",
      explanation: `A linha encosta no limite confortável do ${profile.label.toLowerCase()} (${overflowSemitones} semitom${overflowSemitones === 1 ? "" : "s"} ${directionText}); validar no ensaio antes de redistribuir.`,
      overflowSemitones,
      overflowDirection,
      redistributionActions: ["Manter a linha original por enquanto e observar fadiga, afinação e emissão no ensaio."],
      display,
    };
  }

  return {
    risk: "ideal",
    label: "🟢 Ideal",
    explanation: `A linha fica dentro da região confortável do ${profile.label.toLowerCase()}.`,
    overflowSemitones,
    overflowDirection,
    redistributionActions: ["Manter distribuição vocal original."],
    display,
  };
}
