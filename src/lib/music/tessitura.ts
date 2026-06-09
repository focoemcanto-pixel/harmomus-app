import { midiToBrazilianNote } from "@/lib/music/notes";
import { getSignedSemitoneDistance, normalizeTone, type CanonicalTone } from "@/lib/music/tones";

export type VocalRangeType = "tenor" | "contralto" | "soprano" | "baritono";
export type TessituraStatus = "comfortable" | "extended" | "extreme" | "unsafe";
export type VocalRiskLevel = "safe" | "attention" | "risky";
export type GroupTessituraVoice = Exclude<VocalRangeType, "baritono">;
export type IndividualVoiceTessituraStatus = "comfortable" | "too-high" | "too-low" | "unavailable";
export type GroupTessituraStatus = "original" | "keep-original" | "adapt-high" | "adapt-low" | "unavailable";

export interface TessituraSourceFile {
  tone: string;
  voice: GroupTessituraVoice;
  minMidi: number;
  maxMidi: number;
  confidence?: number | null;
}

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


export interface GroupVoiceTessituraResult {
  voice: GroupTessituraVoice;
  label: string;
  targetMidiRange: { min: number; max: number } | null;
  status: IndividualVoiceTessituraStatus;
}

export interface GroupTessituraRecommendation {
  status: GroupTessituraStatus;
  statusLabel: "Referência oficial" | "Distribuição original" | "Adaptação do kit" | "Sem dados";
  direction: "high" | "low" | null;
  sourceTone: string | null;
  semitoneShift: number | null;
  voices: GroupVoiceTessituraResult[];
  message: string;
  recommendations: Record<GroupTessituraVoice, string>;
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
    absolute: { minMidi: 43, maxMidi: 69 },
    comfortable: { minMidi: 45, maxMidi: 67 },
    warningMarginSemitones: 1,
  },
  contralto: {
    type: "contralto",
    label: "Contralto",
    absolute: { minMidi: 50, maxMidi: 76 },
    comfortable: { minMidi: 52, maxMidi: 72 },
    warningMarginSemitones: 1,
  },
  soprano: {
    type: "soprano",
    label: "Soprano",
    absolute: { minMidi: 55, maxMidi: 79 },
    comfortable: { minMidi: 57, maxMidi: 76 },
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
    extreme: { minMidi: 48, maxMidi: 79 },
    preferredOctaveShift: 0,
  },
  soprano: {
    type: "soprano",
    label: "Soprano",
    comfortable: { minMidi: 60, maxMidi: 79 },
    extended: { minMidi: 55, maxMidi: 81 },
    extreme: { minMidi: 52, maxMidi: 84 },
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

const REDISTRIBUTION_CANDIDATES: Record<GroupTessituraVoice, Record<"too-high" | "too-low", Array<{ voice: GroupTessituraVoice; octaveShift?: 0 | -12 | 12; label: string }>>> = {
  soprano: {
    "too-high": [{ voice: "contralto", label: "voz do contralto" }],
    "too-low": [{ voice: "tenor", octaveShift: 12, label: "voz do tenor uma oitava acima" }, { voice: "contralto", label: "voz do contralto" }],
  },
  contralto: {
    "too-high": [{ voice: "tenor", label: "voz do tenor" }],
    "too-low": [{ voice: "soprano", label: "voz do soprano" }],
  },
  tenor: {
    "too-high": [{ voice: "soprano", octaveShift: -12, label: "voz do soprano uma oitava abaixo" }, { voice: "contralto", label: "voz do contralto" }],
    "too-low": [{ voice: "contralto", label: "voz do contralto" }],
  },
};

const FALLBACK_RECOMMENDATIONS: Record<GroupTessituraVoice, { tooHigh: string; tooLow: string }> = {
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
  if (tooHigh && classifyAgainstRange(minMidi - 12, maxMidi - 12, range, toleranceSemitones) !== "unsafe") return -12;
  if (tooLow && classifyAgainstRange(minMidi + 12, maxMidi + 12, range, toleranceSemitones) !== "unsafe") return 12;
  return 0;
}

function directionText(semitoneShift: number) {
  if (semitoneShift > 0) return "mais aguda";
  if (semitoneShift < 0) return "mais grave";
  return "no mesmo centro tonal";
}

function individualVoiceStatusLabel(status: IndividualVoiceTessituraStatus): IndividualVoiceTessituraRecommendation["statusLabel"] {
  if (status === "comfortable") return "Dentro da margem confortável";
  if (status === "too-high") return "Agudo demais";
  if (status === "too-low") return "Grave demais";
  return "Sem dados";
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
  if (status === "extended") return `A modulação deixou a linha ${direction}, ${tooHigh ? "aproximando a região alta" : tooLow ? "aproximando a região baixa" : "fora do centro confortável"} de ${range.label}. Ainda é utilizável, mas merece atenção no ensaio.`;
  if (status === "extreme") return `A modulação deixou a linha ${direction} e ${tooHigh ? "muito alta" : tooLow ? "muito baixa" : "em região extrema"} para ${range.label}. Use como alerta técnico, não como proibição automática.`;
  const octaveNote = suggestedOctaveShift === -12
    ? " Uma leitura alternativa 1 oitava abaixo pode ser testada, se preservar a função vocal."
    : suggestedOctaveShift === 12
      ? " Uma leitura alternativa 1 oitava acima pode ser testada, se preservar a função vocal."
      : " Avalie redistribuir a linha entre os nipes ou solicitar um tom dedicado.";
  return `A modulação deixou a linha ${direction} e ${tooHigh ? "acima" : tooLow ? "abaixo" : "fora"} da zona segura de ${range.label}.${octaveNote}`;
}

export function classifyRange(minMidi: number, maxMidi: number): { status: TessituraStatus; suggestedRange: VocalRange } {
  const ranges = Object.values(VOCAL_RANGES);
  for (const range of ranges) if (classifyAgainstRange(minMidi, maxMidi, range, DEFAULT_TESSITURA_TOLERANCE_SEMITONES) === "comfortable") return { status: "comfortable", suggestedRange: range };
  for (const range of ranges) if (classifyAgainstRange(minMidi, maxMidi, range, DEFAULT_TESSITURA_TOLERANCE_SEMITONES) === "extended") return { status: "extended", suggestedRange: range };
  for (const range of ranges) if (classifyAgainstRange(minMidi, maxMidi, range, DEFAULT_TESSITURA_TOLERANCE_SEMITONES) === "extreme") return { status: "extreme", suggestedRange: range };
  return { status: "unsafe", suggestedRange: VOCAL_RANGES.tenor };
}

export function analyzeTargetVoiceTessitura({ requestedTone, sourceTone, sourceMinMidi, sourceMaxMidi, voice, toleranceSemitones = DEFAULT_TESSITURA_TOLERANCE_SEMITONES }: {
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

export function analyzeTessitura({ requestedTone, sourceTone, sourceMinMidi, sourceMaxMidi }: {
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
  if (!outsideAbsoluteRange && overflowSemitones === 0) return { level: "safe", label: "Seguro", overflowSemitones: 0, outsideAbsoluteRange: false, reason: `dentro da região confortável de ${range.label}` };
  const direction = aboveComfort > belowComfort ? "acima" : belowComfort > aboveComfort ? "abaixo" : "fora";
  const reason = outsideAbsoluteRange ? `fora da extensão absoluta de ${range.label}` : `passa ${overflowSemitones} semitom${overflowSemitones === 1 ? "" : "s"} ${direction} da zona confortável`;
  if (!outsideAbsoluteRange && overflowSemitones <= range.warningMarginSemitones) return { level: "attention", label: "Atenção", overflowSemitones, outsideAbsoluteRange, reason };
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
    const confidencePenalty = typeof file.confidence === "number" ? Math.max(0, 1 - file.confidence) : 0.15;
    const weightedDistance = Math.abs(semitoneShift) + confidencePenalty;
    if (!best || weightedDistance < best.distance) best = { file, semitoneShift, distance: weightedDistance, usedRealFile };
  }
  return best;
}

function getIndividualVoiceOverflow(minMidi: number, maxMidi: number, voice: GroupTessituraVoice, marginSemitones = PUBLIC_RECOMMENDATION_MARGIN_SEMITONES) {
  const comfortableRange = OFFICIAL_VOCAL_RANGES[voice].comfortable;
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

function classifyIndividualVoice(minMidi: number, maxMidi: number, voice: GroupTessituraVoice, marginSemitones = PUBLIC_RECOMMENDATION_MARGIN_SEMITONES): IndividualVoiceTessituraStatus {
  const { highOverflow, lowOverflow } = getIndividualVoiceOverflow(minMidi, maxMidi, voice, marginSemitones);
  if (highOverflow === 0 && lowOverflow === 0) return "comfortable";
  return highOverflow >= lowOverflow ? "too-high" : "too-low";
}

function evaluateCandidateLine(files: TessituraSourceFile[], singerVoice: GroupTessituraVoice, targetTone: CanonicalTone, candidate: { voice: GroupTessituraVoice; octaveShift?: 0 | -12 | 12; label: string }) {
  const source = pickBestSourceForVoice(files, candidate.voice, targetTone);
  if (!source) return null;
  const projectedRange = projectManualRangeForTone({ min_midi: source.file.minMidi, max_midi: source.file.maxMidi }, source.file.tone, targetTone);
  if (!projectedRange) return null;
  const octaveShift = candidate.octaveShift ?? 0;
  const minMidi = projectedRange.min_midi + octaveShift;
  const maxMidi = projectedRange.max_midi + octaveShift;
  return {
    ...candidate,
    octaveShift,
    status: classifyIndividualVoice(minMidi, maxMidi, singerVoice),
    minMidi,
    maxMidi,
    sourceTone: normalizeTone(source.file.tone),
    usedRealFile: source.usedRealFile,
  };
}

function findRedistributionCandidate(files: TessituraSourceFile[], singerVoice: GroupTessituraVoice, status: IndividualVoiceTessituraStatus, targetTone: CanonicalTone) {
  if (status !== "too-high" && status !== "too-low") return null;
  const evaluated = REDISTRIBUTION_CANDIDATES[singerVoice][status]
    .map((candidate) => evaluateCandidateLine(files, singerVoice, targetTone, candidate))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  return evaluated.find((candidate) => candidate.status === "comfortable") ?? evaluated[0] ?? null;
}

function buildRedistributionRecommendation(status: IndividualVoiceTessituraStatus, voice: GroupTessituraVoice, fallbackLine: string, candidate: ReturnType<typeof findRedistributionCandidate>) {
  if (status === "comfortable") return "";
  if (candidate?.status === "comfortable") {
    return `Nesta tonalidade, recomendamos cantar a ${candidate.label}. Ela fica musicalmente entre ${midiToBrazilianNote(candidate.minMidi)} e ${midiToBrazilianNote(candidate.maxMidi)}, dentro da sua margem confortável.`;
  }
  if (candidate) {
    return `Nesta tonalidade, teste a ${candidate.label}; ela é a alternativa mais próxima, mas ainda aparece como ${individualVoiceStatusLabel(candidate.status).toLowerCase()}. Confirme no ensaio antes de definir.`;
  }
  const label = OFFICIAL_VOCAL_RANGES[voice].label;
  return status === "too-high"
    ? `Nesta tonalidade, é mais seguro testar ${fallbackLine} para aliviar a região alta do ${label}.`
    : `Nesta tonalidade, teste ${fallbackLine} se a linha atual perder presença, brilho ou afinação.`;
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

  const projectedRange = projectManualRangeForTone({ min_midi: source.file.minMidi, max_midi: source.file.maxMidi }, source.file.tone, targetTone);
  if (!projectedRange) {
    return {
      voice,
      label,
      status: "unavailable",
      statusLabel: individualVoiceStatusLabel("unavailable"),
      targetMidiRange: null,
      sourceTone: null,
      semitoneShift: null,
      recommendation: "",
      reason: `Não foi possível projetar a tessitura musical salva para ${label} neste tom.`,
    };
  }

  const targetMin = projectedRange.min_midi;
  const targetMax = projectedRange.max_midi;
  const status = classifyIndividualVoice(targetMin, targetMax, voice);
  const { expandedRange, highOverflow, lowOverflow } = getIndividualVoiceOverflow(targetMin, targetMax, voice);
  const sourceTone = normalizeTone(source.file.tone);
  const direction = directionText(source.semitoneShift);
  const fallbackSet = FALLBACK_RECOMMENDATIONS[voice];
  const fallbackLine = status === "too-high" ? fallbackSet.tooHigh : fallbackSet.tooLow;
  const candidate = findRedistributionCandidate(files, voice, status, targetTone);
  const rangeText = `${midiToBrazilianNote(targetMin)} → ${midiToBrazilianNote(targetMax)}`;
  const toleratedText = `${midiToBrazilianNote(expandedRange.minMidi)} → ${midiToBrazilianNote(expandedRange.maxMidi)}`;
  const sourceDescription = source.usedRealFile ? `Arquivo real em ${sourceTone ?? source.file.tone}.` : `Projeção ${direction} a partir de ${sourceTone ?? source.file.tone}.`;
  const recommendation = buildRedistributionRecommendation(status, voice, fallbackLine, candidate);
  const candidateReason = candidate
    ? candidate.status === "comfortable"
      ? ` A alternativa sugerida (${candidate.label}) também foi checada pela Harmomus IA e encaixou entre ${midiToBrazilianNote(candidate.minMidi)} e ${midiToBrazilianNote(candidate.maxMidi)}.`
      : ` A alternativa mais próxima (${candidate.label}) foi checada, mas ainda precisa de validação no ensaio.`
    : "";
  const reason = status === "comfortable"
    ? `A linha de ${label} fica musicalmente entre ${rangeText}, dentro da margem confortável do nipe. ${sourceDescription}`
    : status === "too-high"
      ? `A linha de ${label} fica musicalmente entre ${rangeText} e passa ${highOverflow} semitom${highOverflow === 1 ? "" : "s"} acima da margem tolerada (${toleratedText}). ${sourceDescription}${candidateReason}`
      : `A linha de ${label} fica musicalmente entre ${rangeText} e passa ${lowOverflow} semitom${lowOverflow === 1 ? "" : "s"} abaixo da margem tolerada (${toleratedText}). ${sourceDescription}${candidateReason}`;

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
      redistributionCandidate: candidate,
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


const GROUP_VOICES: GroupTessituraVoice[] = ["soprano", "contralto", "tenor"];

function isSameTone(a: string | null | undefined, b: string | null | undefined) {
  const normalizedA = normalizeTone(a ?? "");
  const normalizedB = normalizeTone(b ?? "");
  return Boolean(normalizedA && normalizedB && normalizedA === normalizedB);
}

export function projectManualRangeForTone(range: { min_midi: number; max_midi: number }, originalTone: string, targetTone: string) {
  const offset = getSignedSemitoneDistance(originalTone, targetTone);
  if (offset === null) return null;
  return {
    min_midi: range.min_midi + offset,
    max_midi: range.max_midi + offset,
  };
}

export function evaluateProjectedRange(projectedRange: { min_midi: number; max_midi: number }, globalVoiceRange: OfficialVocalRange): IndividualVoiceTessituraStatus {
  const extensionWithMargin = {
    minMidi: globalVoiceRange.absolute.minMidi - globalVoiceRange.warningMarginSemitones,
    maxMidi: globalVoiceRange.absolute.maxMidi + globalVoiceRange.warningMarginSemitones,
  };
  const highOverflow = Math.max(0, projectedRange.max_midi - extensionWithMargin.maxMidi);
  const lowOverflow = Math.max(0, extensionWithMargin.minMidi - projectedRange.min_midi);
  if (highOverflow === 0 && lowOverflow === 0) return "comfortable";
  return highOverflow >= lowOverflow ? "too-high" : "too-low";
}

function classifyAgainstAbsoluteRange(minMidi: number, maxMidi: number, voice: GroupTessituraVoice): IndividualVoiceTessituraStatus {
  return evaluateProjectedRange({ min_midi: minMidi, max_midi: maxMidi }, OFFICIAL_VOCAL_RANGES[voice]);
}

function adaptationTextForVoice(voice: GroupTessituraVoice, direction: "high" | "low") {
  if (direction === "high") {
    if (voice === "soprano") return "Essa linha de soprano fica alta demais nesse tom. Recomendamos adaptar o kit: cante a linha do contralto, pois nesse tom ela passa a cumprir melhor a função de soprano.";
    if (voice === "contralto") return "Como este tom exige adaptação do kit, cante a linha do tenor para manter o equilíbrio das três vozes.";
    return "Como este tom exige adaptação do kit, cante a linha do soprano uma oitava abaixo para manter o arranjo completo.";
  }

  if (voice === "tenor") return "Essa linha de tenor fica grave demais nesse tom. Recomendamos adaptar o kit: cante a linha do contralto, pois nesse tom ela sustenta melhor a função de tenor.";
  if (voice === "contralto") return "Como este tom exige adaptação do kit, cante a linha do soprano para manter o equilíbrio das três vozes.";
  return "Como este tom exige adaptação do kit, cante a linha do tenor uma oitava acima para manter o arranjo completo.";
}

export function evaluateGroupTessituraForTone(files: TessituraSourceFile[], tone: string, originalTone?: string | null): GroupTessituraRecommendation | null {
  if (files.length === 0) return null;
  const normalizedTone = normalizeTone(tone);
  if (!normalizedTone) return null;

  if (isSameTone(normalizedTone, originalTone)) {
    return {
      status: "original",
      statusLabel: "Referência oficial",
      direction: null,
      sourceTone: normalizedTone,
      semitoneShift: 0,
      voices: [],
      message: "Tom original do arranjo. Referência oficial.",
      recommendations: {
        soprano: "Tom original do arranjo. Referência oficial.",
        contralto: "Tom original do arranjo. Referência oficial.",
        tenor: "Tom original do arranjo. Referência oficial.",
      },
    };
  }

  const voices = GROUP_VOICES.map((voice) => {
    const source = pickBestSourceForVoice(files, voice, normalizedTone);
    if (!source) return { voice, label: OFFICIAL_VOCAL_RANGES[voice].label, targetMidiRange: null, status: "unavailable" as IndividualVoiceTessituraStatus, sourceTone: null, semitoneShift: null };
    const projectedRange = projectManualRangeForTone({ min_midi: source.file.minMidi, max_midi: source.file.maxMidi }, source.file.tone, normalizedTone);
    if (!projectedRange) return { voice, label: OFFICIAL_VOCAL_RANGES[voice].label, targetMidiRange: null, status: "unavailable" as IndividualVoiceTessituraStatus, sourceTone: null, semitoneShift: null };
    const min = projectedRange.min_midi;
    const max = projectedRange.max_midi;
    return {
      voice,
      label: OFFICIAL_VOCAL_RANGES[voice].label,
      targetMidiRange: { min, max },
      status: classifyAgainstAbsoluteRange(min, max, voice),
      sourceTone: normalizeTone(source.file.tone),
      semitoneShift: source.semitoneShift,
    };
  });

  if (voices.some((voice) => voice.status === "unavailable")) {
    return {
      status: "unavailable",
      statusLabel: "Sem dados",
      direction: null,
      sourceTone: null,
      semitoneShift: null,
      voices,
      message: "Ainda não há tessitura oficial suficiente para calcular este tom.",
      recommendations: {
        soprano: "Ainda não há tessitura oficial suficiente para calcular este tom.",
        contralto: "Ainda não há tessitura oficial suficiente para calcular este tom.",
        tenor: "Ainda não há tessitura oficial suficiente para calcular este tom.",
      },
    };
  }

  const highCount = voices.filter((voice) => voice.status === "too-high").length;
  const lowCount = voices.filter((voice) => voice.status === "too-low").length;
  if (highCount === 0 && lowCount === 0) {
    return {
      status: "keep-original",
      statusLabel: "Distribuição original",
      direction: null,
      sourceTone: voices[0]?.sourceTone ?? null,
      semitoneShift: voices[0]?.semitoneShift ?? null,
      voices,
      message: "Este tom mantém as três vozes dentro da região aceitável. Use a distribuição original do kit.",
      recommendations: {
        soprano: "Este tom mantém as três vozes dentro da região aceitável. Cante a linha original de soprano.",
        contralto: "Este tom mantém as três vozes dentro da região aceitável. Cante a linha original de contralto.",
        tenor: "Este tom mantém as três vozes dentro da região aceitável. Cante a linha original de tenor.",
      },
    };
  }

  const direction: "high" | "low" = highCount >= lowCount ? "high" : "low";
  return {
    status: direction === "high" ? "adapt-high" : "adapt-low",
    statusLabel: "Adaptação do kit",
    direction,
    sourceTone: voices[0]?.sourceTone ?? null,
    semitoneShift: voices[0]?.semitoneShift ?? null,
    voices,
    message: direction === "high"
      ? "Este tom fica alto para o arranjo completo. Recomendamos adaptar todas as vozes do kit."
      : "Este tom fica baixo para o arranjo completo. Recomendamos adaptar todas as vozes do kit.",
    recommendations: {
      soprano: adaptationTextForVoice("soprano", direction),
      contralto: adaptationTextForVoice("contralto", direction),
      tenor: adaptationTextForVoice("tenor", direction),
    },
  };
}
