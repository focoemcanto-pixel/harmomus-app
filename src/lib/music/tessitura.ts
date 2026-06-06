import { midiToBrazilianNote } from "@/lib/music/notes";
import { getSignedSemitoneDistance, normalizeTone, type CanonicalTone } from "@/lib/music/tones";

export type VocalRangeType = "tenor" | "contralto" | "soprano" | "baritono";
export type TessituraStatus = "comfortable" | "extended" | "extreme" | "unsafe";
export type VocalRiskLevel = "safe" | "attention" | "risky";

export type GroupTessituraVoice = Exclude<VocalRangeType, "baritono">;

export interface TessituraSourceFile {
  tone: string;
  voice: GroupTessituraVoice;
  minMidi: number;
  maxMidi: number;
  confidence?: number | null;
}

export type IndividualVoiceTessituraStatus = "comfortable" | "too-high" | "too-low" | "unavailable";

export interface IndividualVoiceTessituraRecommendation {
  voice: GroupTessituraVoice;
  label: string;
  status: IndividualVoiceTessituraStatus;
  statusLabel: "Dentro da margem confortável" | "Agudo demais" | "Grave demais" | "Sem dados";
  targetMidiRange: { min: number; max: number } | null;
  sourceTone: string | null;
  semitoneShift: number | null;
  recommendation: string;
  reason: string;
}

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

export interface OfficialVocalRange {
  type: GroupTessituraVoice;
  label: string;
  absolute: VocalZone;
  comfortable: VocalZone;
  warningMarginSemitones: number;
}

export interface VocalRangeRecommendation {
  level: VocalRiskLevel;
  label: "Seguro" | "Atenção" | "Arriscado";
  overflowSemitones: number;
  outsideAbsoluteRange: boolean;
  reason: string;
}

export interface TessituraAnalysis {
  requestedTone: string;
  sourceTone: string;
  semitoneShift: number;
  targetMidiRange: { min: number; max: number };
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
  targetMidiRange: { min: number; max: number };
  status: TessituraStatus;
  suggestedOctaveShift: 0 | -12 | 12;
  toleranceSemitones: number;
  message: string;
}

const DEFAULT_TESSITURA_TOLERANCE_SEMITONES = 1;
const PUBLIC_RECOMMENDATION_MARGIN_SEMITONES = 1;

export const OFFICIAL_VOCAL_RANGES: Record<GroupTessituraVoice, OfficialVocalRange> = {
  tenor: {
    type: "tenor",
    label: "Tenor",
    absolute: { minMidi: 48, maxMidi: 72 },
    comfortable: { minMidi: 48, maxMidi: 68 },
    warningMarginSemitones: 1,
  },
  contralto: {
    type: "contralto",
    label: "Contralto",
    absolute: { minMidi: 43, maxMidi: 79 },
    comfortable: { minMidi: 55, maxMidi: 74 },
    warningMarginSemitones: 1,
  },
  soprano: {
    type: "soprano",
    label: "Soprano",
    absolute: { minMidi: 48, maxMidi: 84 },
    comfortable: { minMidi: 60, maxMidi: 76 },
    warningMarginSemitones: 1,
  },
};

export const VOCAL_RANGES: Record<VocalRangeType, VocalRange> = {
  baritono: {
    type: "baritono",
    label: "Barítono",
    comfortable: { minMidi: 43, maxMidi: 62 },
    extended: { minMidi: 40, maxMidi: 65 },
    extreme: { minMidi: 38, maxMidi: 67 },
    preferredOctaveShift: 0,
  },
  tenor: {
    type: "tenor",
    label: "Tenor",
    comfortable: { minMidi: 48, maxMidi: 68 },
    extended: { minMidi: 45, maxMidi: 72 },
    extreme: { minMidi: 43, maxMidi: 74 },
    preferredOctaveShift: 0,
  },
  contralto: {
    type: "contralto",
    label: "Contralto",
    comfortable: { minMidi: 55, maxMidi: 74 },
    extended: { minMidi: 50, maxMidi: 78 },
    extreme: { minMidi: 43, maxMidi: 79 },
    preferredOctaveShift: 0,
  },
  soprano: {
    type: "soprano",
    label: "Soprano",
    comfortable: { minMidi: 60, maxMidi: 76 },
    extended: { minMidi: 55, maxMidi: 81 },
    extreme: { minMidi: 48, maxMidi: 84 },
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

export function applySemitoneShift(midi: number, semitoneShift: number, octaveShift = 0) {
  return midi + semitoneShift + octaveShift;
}

function classifyAgainstRange(minMidi: number, maxMidi: number, range: VocalRange, toleranceSemitones = 0): TessituraStatus {
  if (minMidi >= range.comfortable.minMidi - toleranceSemitones && maxMidi <= range.comfortable.maxMidi + toleranceSemitones) return "comfortable";
  if (minMidi >= range.extended.minMidi - toleranceSemitones && maxMidi <= range.extended.maxMidi + toleranceSemitones) return "extended";
  if (minMidi >= range.extreme.minMidi - toleranceSemitones && maxMidi <= range.extreme.maxMidi + toleranceSemitones) return "extreme";
  return "unsafe";
}

function getOctaveAlternative(minMidi: number, maxMidi: number, range: VocalRange, toleranceSemitones: number): 0 | -12 | 12 {
  const tooHigh = maxMidi > range.extreme.maxMidi + toleranceSemitones;
  const tooLow = minMidi < range.extreme.minMidi - toleranceSemitones;

  if (tooHigh) {
    const downStatus = classifyAgainstRange(minMidi - 12, maxMidi - 12, range, toleranceSemitones);
    if (downStatus !== "unsafe") return -12;
  }

  if (tooLow) {
    const upStatus = classifyAgainstRange(minMidi + 12, maxMidi + 12, range, toleranceSemitones);
    if (upStatus !== "unsafe") return 12;
  }

  return 0;
}

function directionText(semitoneShift: number) {
  if (semitoneShift > 0) return "mais aguda";
  if (semitoneShift < 0) return "mais grave";
  return "no mesmo centro tonal";
}

function buildTargetVoiceMessage({ status, range, semitoneShift, shiftedMin, shiftedMax, suggestedOctaveShift }: {
  status: TessituraStatus;
  range: VocalRange;
  semitoneShift: number;
  shiftedMin: number;
  shiftedMax: number;
  suggestedOctaveShift: 0 | -12 | 12;
}) {
  const direction = directionText(semitoneShift);
  const tooHigh = shiftedMax > range.comfortable.maxMidi;
  const tooLow = shiftedMin < range.comfortable.minMidi;

  if (status === "comfortable") return `A modulação deixou a linha ${direction}, mas ainda dentro da zona confortável de ${range.label}.`;
  if (status === "extended") {
    const edge = tooHigh ? "aproximando a região alta" : tooLow ? "aproximando a região baixa" : "fora do centro confortável";
    return `A modulação deixou a linha ${direction}, ${edge} de ${range.label}. Ainda é utilizável, mas merece atenção no ensaio.`;
  }
  if (status === "extreme") {
    const edge = tooHigh ? "muito alta" : tooLow ? "muito baixa" : "em região extrema";
    return `A modulação deixou a linha ${direction} e ${edge} para ${range.label}. Use como alerta técnico, não como proibição automática.`;
  }

  const edge = tooHigh ? "acima" : tooLow ? "abaixo" : "fora";
  const octaveNote = suggestedOctaveShift === -12
    ? " Uma leitura alternativa 1 oitava abaixo pode ser testada, se preservar a função vocal."
    : suggestedOctaveShift === 12
      ? " Uma leitura alternativa 1 oitava acima pode ser testada, se preservar a função vocal."
      : " Avalie redistribuir a linha entre os nipes ou solicitar um tom dedicado.";

  return `A modulação deixou a linha ${direction} e ${edge} da zona segura de ${range.label}.${octaveNote}`;
}

export function classifyRange(minMidi: number, maxMidi: number): { status: TessituraStatus; suggestedRange: VocalRange } {
  const ranges = Object.values(VOCAL_RANGES);
  for (const range of ranges) if (classifyAgainstRange(minMidi, maxMidi, range, DEFAULT_TESSITURA_TOLERANCE_SEMITONES) === "comfortable") return { status: "comfortable", suggestedRange: range };
  for (const range of ranges) if (classifyAgainstRange(minMidi, maxMidi, range, DEFAULT_TESSITURA_TOLERANCE_SEMITONES) === "extended") return { status: "extended", suggestedRange: range };
  for (const range of ranges) if (classifyAgainstRange(minMidi, maxMidi, range, DEFAULT_TESSITURA_TOLERANCE_SEMITONES) === "extreme") return { status: "extreme", suggestedRange: range };
  return { status: "unsafe", suggestedRange: VOCAL_RANGES.tenor };
}

export function analyzeTargetVoiceTessitura({
  requestedTone,
  sourceTone,
  sourceMinMidi,
  sourceMaxMidi,
  voice,
  toleranceSemitones = DEFAULT_TESSITURA_TOLERANCE_SEMITONES,
}: {
  requestedTone: string;
  sourceTone: string;
  sourceMinMidi: number;
  sourceMaxMidi: number;
  voice: VocalRangeType;
  toleranceSemitones?: number;
}): TargetVoiceTessituraAnalysis | null {
  const semitoneShift = getSignedSemitoneDistance(sourceTone, requestedTone);
  if (semitoneShift === null) return null;

  const range = VOCAL_RANGES[voice];
  const shiftedMin = applySemitoneShift(sourceMinMidi, semitoneShift);
  const shiftedMax = applySemitoneShift(sourceMaxMidi, semitoneShift);
  const status = classifyAgainstRange(shiftedMin, shiftedMax, range, toleranceSemitones);
  const octaveShift = status === "unsafe" ? getOctaveAlternative(shiftedMin, shiftedMax, range, toleranceSemitones) : 0;

  return {
    requestedTone,
    sourceTone,
    semitoneShift,
    voice,
    targetMidiRange: { min: shiftedMin, max: shiftedMax },
    status,
    suggestedOctaveShift: octaveShift,
    toleranceSemitones,
    message: buildTargetVoiceMessage({ status, range, semitoneShift, shiftedMin, shiftedMax, suggestedOctaveShift: octaveShift }),
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
  const { status, suggestedRange } = classifyRange(shiftedMin, shiftedMax);
  const octaveShift = status === "unsafe" ? getOctaveAlternative(shiftedMin, shiftedMax, suggestedRange, DEFAULT_TESSITURA_TOLERANCE_SEMITONES) : 0;

  return {
    requestedTone,
    sourceTone,
    semitoneShift,
    targetMidiRange: { min: shiftedMin, max: shiftedMax },
    status,
    suggestedRange: suggestedRange.type,
    suggestedOctaveShift: octaveShift,
    message: buildTargetVoiceMessage({ status, range: suggestedRange, semitoneShift, shiftedMin, shiftedMax, suggestedOctaveShift: octaveShift }),
  };
}

export function getOfficialVocalRangeRecommendation(minMidi: number, maxMidi: number, voice: GroupTessituraVoice): VocalRangeRecommendation {
  const range = OFFICIAL_VOCAL_RANGES[voice];
  const belowComfort = Math.max(0, range.comfortable.minMidi - minMidi);
  const aboveComfort = Math.max(0, maxMidi - range.comfortable.maxMidi);
  const belowAbsolute = Math.max(0, range.absolute.minMidi - minMidi);
  const aboveAbsolute = Math.max(0, maxMidi - range.absolute.maxMidi);
  const overflowSemitones = Math.max(belowComfort, aboveComfort);
  const outsideAbsoluteRange = belowAbsolute > 0 || aboveAbsolute > 0;

  if (!outsideAbsoluteRange && overflowSemitones === 0) {
    return { level: "safe", label: "Seguro", overflowSemitones: 0, outsideAbsoluteRange: false, reason: `dentro da região confortável de ${range.label}` };
  }

  const direction = aboveComfort > belowComfort ? "acima" : belowComfort > aboveComfort ? "abaixo" : "fora";
  const reason = outsideAbsoluteRange
    ? `fora da extensão absoluta de ${range.label}`
    : `passa ${overflowSemitones} semitom${overflowSemitones === 1 ? "" : "s"} ${direction} da zona confortável`;

  if (!outsideAbsoluteRange && overflowSemitones <= range.warningMarginSemitones) {
    return { level: "attention", label: "Atenção", overflowSemitones, outsideAbsoluteRange, reason };
  }

  return { level: "risky", label: "Arriscado", overflowSemitones, outsideAbsoluteRange, reason };
}

function pickBestSourceForVoice(files: TessituraSourceFile[], voice: GroupTessituraVoice, targetTone: CanonicalTone) {
  let best: { file: TessituraSourceFile; semitoneShift: number; distance: number; usedRealFile: boolean } | null = null;

  for (const file of files) {
    if (file.voice !== voice) continue;
    const sourceTone = normalizeTone(file.tone);
    if (!sourceTone) continue;
    const semitoneShift = getSignedSemitoneDistance(sourceTone, targetTone);
    if (semitoneShift === null) continue;

    const usedRealFile = semitoneShift === 0;
    if (usedRealFile) return { file, semitoneShift, distance: 0, usedRealFile };

    const distance = Math.abs(semitoneShift);
    const confidencePenalty = typeof file.confidence === "number" ? Math.max(0, 1 - file.confidence) : 0.15;
    const weightedDistance = distance + confidencePenalty;
    if (!best || weightedDistance < best.distance) best = { file, semitoneShift, distance: weightedDistance, usedRealFile };
  }

  return best;
}

const INDIVIDUAL_VOICE_RECOMMENDATIONS: Record<GroupTessituraVoice, { tooHigh: string; tooLow: string }> = {
  soprano: {
    tooHigh: "a voz do contralto",
    tooLow: "uma linha mais aguda do arranjo, se perder brilho ou projeção",
  },
  contralto: {
    tooHigh: "a voz do tenor",
    tooLow: "a voz do soprano, se a linha atual ficar pesada ou sem presença",
  },
  tenor: {
    tooHigh: "a voz do soprano uma oitava abaixo",
    tooLow: "a voz do contralto, se a linha atual perder presença",
  },
};

function getIndividualComfortableRange(voice: GroupTessituraVoice): VocalZone {
  return OFFICIAL_VOCAL_RANGES[voice].comfortable;
}

function getIndividualVoiceOverflow(minMidi: number, maxMidi: number, voice: GroupTessituraVoice, marginSemitones = PUBLIC_RECOMMENDATION_MARGIN_SEMITONES) {
  const comfortableRange = getIndividualComfortableRange(voice);
  const expandedRange = {
    minMidi: comfortableRange.minMidi - marginSemitones,
    maxMidi: comfortableRange.maxMidi + marginSemitones,
  };

  return {
    comfortableRange,
    expandedRange,
    highOverflow: Math.max(0, maxMidi - expandedRange.maxMidi),
    lowOverflow: Math.max(0, expandedRange.minMidi - minMidi),
  };
}

function classifyIndividualVoice(
  minMidi: number,
  maxMidi: number,
  voice: GroupTessituraVoice,
  marginSemitones = PUBLIC_RECOMMENDATION_MARGIN_SEMITONES,
): IndividualVoiceTessituraStatus {
  const { highOverflow, lowOverflow } = getIndividualVoiceOverflow(minMidi, maxMidi, voice, marginSemitones);
  if (highOverflow === 0 && lowOverflow === 0) return "comfortable";
  return highOverflow >= lowOverflow ? "too-high" : "too-low";
}

function individualVoiceStatusLabel(status: IndividualVoiceTessituraStatus): IndividualVoiceTessituraRecommendation["statusLabel"] {
  if (status === "comfortable") return "Dentro da margem confortável";
  if (status === "too-high") return "Agudo demais";
  if (status === "too-low") return "Grave demais";
  return "Sem dados";
}

function buildIndividualVoiceRecommendation(files: TessituraSourceFile[], voice: GroupTessituraVoice, targetTone: CanonicalTone): IndividualVoiceTessituraRecommendation {
  const source = pickBestSourceForVoice(files, voice, targetTone);
  const label = OFFICIAL_VOCAL_RANGES[voice].label;

  if (!source) {
    return {
      voice,
      label,
      status: "unavailable",
      statusLabel: individualVoiceStatusLabel("unavailable"),
      targetMidiRange: null,
      sourceTone: null,
      semitoneShift: null,
      recommendation: "",
      reason: `Não há dados de tessitura musical salvos para ${label}.`,
    };
  }

  const targetMin = applySemitoneShift(source.file.minMidi, source.semitoneShift);
  const targetMax = applySemitoneShift(source.file.maxMidi, source.semitoneShift);
  const status = classifyIndividualVoice(targetMin, targetMax, voice);
  const { expandedRange, highOverflow, lowOverflow } = getIndividualVoiceOverflow(targetMin, targetMax, voice);
  const sourceTone = normalizeTone(source.file.tone);
  const direction = directionText(source.semitoneShift);
  const recommendationSet = INDIVIDUAL_VOICE_RECOMMENDATIONS[voice];
  const recommendedLine = status === "too-high" ? recommendationSet.tooHigh : recommendationSet.tooLow;
  const rangeText = `${midiToBrazilianNote(targetMin)} → ${midiToBrazilianNote(targetMax)}`;
  const toleratedText = `${midiToBrazilianNote(expandedRange.minMidi)} → ${midiToBrazilianNote(expandedRange.maxMidi)}`;
  const sourceDescription = source.usedRealFile
    ? `Arquivo real em ${sourceTone ?? source.file.tone}.`
    : `Projeção ${direction} a partir de ${sourceTone ?? source.file.tone}.`;

  const recommendation = status === "comfortable"
    ? ""
    : status === "too-high"
      ? `Nesta tonalidade, é mais seguro cantar ${recommendedLine}.`
      : `Nesta tonalidade, teste ${recommendedLine}.`;

  const reason = status === "comfortable"
    ? `A linha de ${label} fica musicalmente entre ${rangeText}, dentro da margem confortável do nipe. ${sourceDescription}`
    : status === "too-high"
      ? `A linha de ${label} fica musicalmente entre ${rangeText} e passa ${highOverflow} semitom${highOverflow === 1 ? "" : "s"} acima da margem tolerada (${toleratedText}). ${sourceDescription}`
      : `A linha de ${label} fica musicalmente entre ${rangeText} e passa ${lowOverflow} semitom${lowOverflow === 1 ? "" : "s"} abaixo da margem tolerada (${toleratedText}). ${sourceDescription}`;

  if (process.env.NODE_ENV !== "production") {
    console.debug("[tessitura:individual]", {
      voice,
      selectedTone: targetTone,
      sourceTone: sourceTone ?? source.file.tone,
      sourceMode: source.usedRealFile ? "arquivo-real" : "projecao",
      musicalMidiRange: { min: source.file.minMidi, max: source.file.maxMidi },
      projectedMidiRange: { min: targetMin, max: targetMax },
      expandedRange,
      marginSemitones: PUBLIC_RECOMMENDATION_MARGIN_SEMITONES,
      overflow: { high: highOverflow, low: lowOverflow },
      status,
    });
  }

  return {
    voice,
    label,
    status,
    statusLabel: individualVoiceStatusLabel(status),
    targetMidiRange: { min: targetMin, max: targetMax },
    sourceTone,
    semitoneShift: source.semitoneShift,
    recommendation,
    reason,
  };
}

export function evaluateIndividualVoiceTessituraForTone(files: TessituraSourceFile[], tone: string, voice: GroupTessituraVoice): IndividualVoiceTessituraRecommendation | null {
  if (files.length === 0) return null;

  const normalizedTone = normalizeTone(tone);
  if (!normalizedTone) return null;

  return buildIndividualVoiceRecommendation(files, voice, normalizedTone);
}
