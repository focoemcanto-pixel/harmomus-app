import { midiToBrazilianNote } from "@/lib/music-notes";
import { getVocalProfile, type VocalProfileType } from "@/lib/vocal-profiles";

export type RecommendationRisk = "ideal" | "safe" | "warning" | "risky" | "incomplete";

export interface ToneRecommendationInput {
  voiceType: VocalProfileType | string;
  detectedMinMidi?: number | null;
  detectedMaxMidi?: number | null;
  comfortMinMidi?: number | null;
  comfortMaxMidi?: number | null;
  peakMaxMidi?: number | null;
}

export interface ToneRecommendation {
  score: number;
  risk: RecommendationRisk;
  label: string;
  explanation: string;
  overflowSemitones: number;
  display: {
    detectedRange: string;
    comfortRange: string;
    profileComfortRange: string;
  };
}

const INCOMPLETE_RANGE = "— → —";

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatRange(min?: number | null, max?: number | null) {
  if (!isNumber(min) || !isNumber(max)) return INCOMPLETE_RANGE;
  return `${midiToBrazilianNote(min)} → ${midiToBrazilianNote(max)}`;
}

function buildIncompleteRecommendation(input: ToneRecommendationInput): ToneRecommendation {
  const profile = getVocalProfile(input.voiceType);

  return {
    score: 0,
    risk: "incomplete",
    label: "⚪ Incompleto",
    explanation: "Análise incompleta — reanalisar.",
    overflowSemitones: 0,
    display: {
      detectedRange: formatRange(input.detectedMinMidi, input.detectedMaxMidi),
      comfortRange: formatRange(input.comfortMinMidi, input.comfortMaxMidi),
      profileComfortRange: profile ? formatRange(profile.comfortMinMidi, profile.comfortMaxMidi) : INCOMPLETE_RANGE,
    },
  };
}

export function calculateToneRecommendation(input: ToneRecommendationInput): ToneRecommendation {
  const profile = getVocalProfile(input.voiceType);
  const display = {
    detectedRange: formatRange(input.detectedMinMidi, input.detectedMaxMidi),
    comfortRange: formatRange(input.comfortMinMidi, input.comfortMaxMidi),
    profileComfortRange: profile ? formatRange(profile.comfortMinMidi, profile.comfortMaxMidi) : INCOMPLETE_RANGE,
  };

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
  const detectedInsideComfort = input.detectedMinMidi >= profile.comfortMinMidi && input.detectedMaxMidi <= profile.comfortMaxMidi;

  if (outsideAbsolute) {
    return {
      score: 40,
      risk: "risky",
      label: "🔴 Arriscado",
      explanation: "Esse tom passa da extensão segura do naipe.",
      overflowSemitones,
      display,
    };
  }

  if (overflowSemitones === 0) {
    return {
      score: detectedInsideComfort ? 100 : 92,
      risk: detectedInsideComfort ? "ideal" : "safe",
      label: detectedInsideComfort ? "🟢 Ideal" : "🟢 Seguro",
      explanation: detectedInsideComfort
        ? `Esse tom fica dentro da região confortável do ${profile.label.toLowerCase()}.`
        : `A região confortável detectada fica dentro da zona confortável do ${profile.label.toLowerCase()}.`,
      overflowSemitones,
      display,
    };
  }

  if (overflowSemitones <= profile.warningMargin) {
    return {
      score: Math.max(60, 85 - overflowSemitones * 5),
      risk: "warning",
      label: "🟡 Atenção",
      explanation: `Esse tom ultrapassa em ${overflowSemitones} semitom${overflowSemitones === 1 ? "" : "s"} a zona confortável.`,
      overflowSemitones,
      display,
    };
  }

  return {
    score: Math.max(0, 59 - (overflowSemitones - profile.warningMargin) * 8),
    risk: "risky",
    label: "🔴 Arriscado",
    explanation: `Esse tom ultrapassa em ${overflowSemitones} semitom${overflowSemitones === 1 ? "" : "s"} a zona confortável.`,
    overflowSemitones,
    display,
  };
}
