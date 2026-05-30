import { CHROMATIC_TONES_SHARP, getSignedSemitoneDistance, normalizeTone, type CanonicalTone } from "@/lib/music/tones";

export type VocalRangeType = "tenor" | "contralto" | "soprano" | "baritono";
export type TessituraStatus = "comfortable" | "extended" | "extreme" | "unsafe";
export type VocalRiskLevel = "safe" | "attention" | "risky";

export type HarmomusIaStatus = "ideal" | "comfortable-limit" | "reorganize";
export type GroupTessituraVoice = Exclude<VocalRangeType, "baritono">;

export interface TessituraSourceFile {
  tone: string;
  voice: GroupTessituraVoice;
  minMidi: number;
  maxMidi: number;
  confidence?: number | null;
}

export interface VoiceToneCompatibility {
  voice: GroupTessituraVoice;
  label: string;
  status: HarmomusIaStatus;
  statusLabel: "Ideal" | "Limite confortável" | "Reorganização recomendada";
  semaphore: "🟢" | "🟡" | "🔴";
  compatibility: number;
  targetMidiRange: { min: number; max: number } | null;
  sourceTone: string | null;
  semitoneShift: number | null;
  recommendation: string;
  reason: string;
}

export interface GroupToneCompatibility {
  tone: CanonicalTone;
  status: HarmomusIaStatus;
  statusLabel: "Ideal" | "Limite confortável" | "Reorganização recomendada";
  compatibility: number;
  recommendation: string;
  reason: string;
  voices: VoiceToneCompatibility[];
}

export interface BestToneForGroupRecommendation extends GroupToneCompatibility {
  evaluatedTones: GroupToneCompatibility[];
  justification: string;
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
  type: Exclude<VocalRangeType, "baritono">;
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
  toleranceSemitones: number;
  message: string;
}

const DEFAULT_TESSITURA_TOLERANCE_SEMITONES = 1;

export const OFFICIAL_VOCAL_RANGES: Record<Exclude<VocalRangeType, "baritono">, OfficialVocalRange> = {
  tenor: {
    type: "tenor",
    label: "Tenor",
    absolute: { minMidi: 48, maxMidi: 72 },
    comfortable: { minMidi: 53, maxMidi: 67 },
    warningMarginSemitones: 2,
  },
  contralto: {
    type: "contralto",
    label: "Contralto",
    absolute: { minMidi: 50, maxMidi: 74 },
    comfortable: { minMidi: 53, maxMidi: 71 },
    warningMarginSemitones: 2,
  },
  soprano: {
    type: "soprano",
    label: "Soprano",
    absolute: { minMidi: 57, maxMidi: 77 },
    comfortable: { minMidi: 60, maxMidi: 72 },
    warningMarginSemitones: 2,
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
    comfortable: { minMidi: 48, maxMidi: 67 },
    extended: { minMidi: 45, maxMidi: 71 },
    extreme: { minMidi: 43, maxMidi: 74 },
    preferredOctaveShift: 0,
  },
  contralto: {
    type: "contralto",
    label: "Contralto",
    comfortable: { minMidi: 52, maxMidi: 72 },
    extended: { minMidi: 48, maxMidi: 76 },
    extreme: { minMidi: 45, maxMidi: 79 },
    preferredOctaveShift: 0,
  },
  soprano: {
    type: "soprano",
    label: "Soprano",
    comfortable: { minMidi: 57, maxMidi: 72 },
    extended: { minMidi: 55, maxMidi: 79 },
    extreme: { minMidi: 53, maxMidi: 84 },
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

  if (status === "comfortable") {
    return `A modulação deixou a linha ${direction}, mas ainda dentro da zona confortável de ${range.label}.`;
  }

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
  const classification = classifyRange(shiftedMin, shiftedMax);
  const octaveShift = classification.status === "unsafe" ? getOctaveAlternative(shiftedMin, shiftedMax, classification.suggestedRange, DEFAULT_TESSITURA_TOLERANCE_SEMITONES) : 0;

  const messageMap: Record<TessituraStatus, string> = {
    comfortable: "Tessitura confortável para o nipe sugerido.",
    extended: "Tessitura utilizável, mas próxima dos limites de conforto.",
    extreme: "Tessitura extrema detectada. Requer maior técnica e controle vocal.",
    unsafe: "Tessitura fora da região segura recomendada.",
  };

  return {
    requestedTone,
    sourceTone,
    semitoneShift,
    targetMidiRange: { min: shiftedMin, max: shiftedMax },
    status: classification.status,
    suggestedRange: classification.suggestedRange.type,
    suggestedOctaveShift: octaveShift,
    message: messageMap[classification.status],
  };
}
export function classifyOfficialVoiceRange(
  voice: VocalRangeType,
  mainMinMidi?: number | null,
  mainMaxMidi?: number | null,
): VocalRangeRecommendation | null {
  if (voice === "baritono" || typeof mainMinMidi !== "number" || typeof mainMaxMidi !== "number") return null;

  const range = OFFICIAL_VOCAL_RANGES[voice];
  const belowComfort = Math.max(0, range.comfortable.minMidi - mainMinMidi);
  const aboveComfort = Math.max(0, mainMaxMidi - range.comfortable.maxMidi);
  const overflowSemitones = Math.max(belowComfort, aboveComfort);
  const outsideAbsoluteRange = mainMinMidi < range.absolute.minMidi || mainMaxMidi > range.absolute.maxMidi;

  if (!outsideAbsoluteRange && overflowSemitones === 0) {
    return {
      level: "safe",
      label: "Seguro",
      overflowSemitones,
      outsideAbsoluteRange,
      reason: "range principal dentro da zona confortável",
    };
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


const GROUP_VOICES: GroupTessituraVoice[] = ["soprano", "contralto", "tenor"];
const HARMOMUS_STATUS_WEIGHT: Record<HarmomusIaStatus, number> = {
  ideal: 3,
  "comfortable-limit": 2,
  reorganize: 1,
};

function clampCompatibility(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getRangeOverflow(minMidi: number, maxMidi: number, zone: VocalZone) {
  return Math.max(0, zone.minMidi - minMidi) + Math.max(0, maxMidi - zone.maxMidi);
}

function statusMeta(status: HarmomusIaStatus): Pick<VoiceToneCompatibility, "statusLabel" | "semaphore"> {
  if (status === "ideal") return { statusLabel: "Ideal", semaphore: "🟢" };
  if (status === "comfortable-limit") return { statusLabel: "Limite confortável", semaphore: "🟡" };
  return { statusLabel: "Reorganização recomendada", semaphore: "🔴" };
}

function classifyGroupVoice(minMidi: number, maxMidi: number, voice: GroupTessituraVoice) {
  const officialRange = OFFICIAL_VOCAL_RANGES[voice];
  const comfortableOverflow = getRangeOverflow(minMidi, maxMidi, officialRange.comfortable);
  const absoluteOverflow = getRangeOverflow(minMidi, maxMidi, officialRange.absolute);
  const nearComfortLimit =
    minMidi < officialRange.comfortable.minMidi + officialRange.warningMarginSemitones
    || maxMidi > officialRange.comfortable.maxMidi - officialRange.warningMarginSemitones;

  if (absoluteOverflow > 0) {
    return {
      status: "reorganize" as const,
      compatibility: clampCompatibility(35 - absoluteOverflow * 8),
      reason: `A linha ultrapassa a extensão absoluta de ${officialRange.label} em ${absoluteOverflow} semitom(ns).`,
    };
  }

  if (comfortableOverflow > 0) {
    return {
      status: "comfortable-limit" as const,
      compatibility: clampCompatibility(78 - comfortableOverflow * 5),
      reason: `A linha fica dentro da extensão possível de ${officialRange.label}, mas sai da zona confortável em ${comfortableOverflow} semitom(ns).`,
    };
  }

  if (nearComfortLimit) {
    return {
      status: "comfortable-limit" as const,
      compatibility: 88,
      reason: `A linha cabe na zona confortável de ${officialRange.label}, porém trabalha perto do limite do nipe.`,
    };
  }

  return {
    status: "ideal" as const,
    compatibility: 100,
    reason: `A linha permanece centralizada na zona confortável de ${officialRange.label}.`,
  };
}

function pickBestSourceForVoice(files: TessituraSourceFile[], voice: GroupTessituraVoice, targetTone: CanonicalTone) {
  let best: { file: TessituraSourceFile; semitoneShift: number; distance: number } | null = null;

  for (const file of files) {
    if (file.voice !== voice) continue;
    const sourceTone = normalizeTone(file.tone);
    if (!sourceTone) continue;
    const semitoneShift = getSignedSemitoneDistance(sourceTone, targetTone);
    if (semitoneShift === null) continue;
    const distance = Math.abs(semitoneShift);
    const confidencePenalty = typeof file.confidence === "number" ? Math.max(0, 1 - file.confidence) : 0.15;
    const scoreDistance = distance + confidencePenalty;
    if (!best || scoreDistance < best.distance) best = { file, semitoneShift, distance: scoreDistance };
  }

  return best;
}

function buildVoiceCompatibility(files: TessituraSourceFile[], voice: GroupTessituraVoice, targetTone: CanonicalTone): VoiceToneCompatibility {
  const source = pickBestSourceForVoice(files, voice, targetTone);
  const label = OFFICIAL_VOCAL_RANGES[voice].label;

  if (!source) {
    const meta = statusMeta("reorganize");
    return {
      voice,
      label,
      status: "reorganize",
      ...meta,
      compatibility: 0,
      targetMidiRange: null,
      sourceTone: null,
      semitoneShift: null,
      recommendation: `Inclua ou analise a linha de ${label} para ativar a recomendação completa.`,
      reason: `Não há dados de tessitura salvos para ${label}.`,
    };
  }

  const targetMin = applySemitoneShift(source.file.minMidi, source.semitoneShift);
  const targetMax = applySemitoneShift(source.file.maxMidi, source.semitoneShift);
  const classified = classifyGroupVoice(targetMin, targetMax, voice);
  const meta = statusMeta(classified.status);
  const direction = directionText(source.semitoneShift);
  const recommendation = classified.status === "ideal"
    ? `${label} pode estudar este tom com boa margem de conforto.`
    : classified.status === "comfortable-limit"
      ? `${label} pode usar este tom, com atenção às notas de borda no ensaio.`
      : `Reorganize a linha de ${label} ou escolha outro tom para proteger o nipe.`;

  return {
    voice,
    label,
    status: classified.status,
    ...meta,
    compatibility: classified.compatibility,
    targetMidiRange: { min: targetMin, max: targetMax },
    sourceTone: normalizeTone(source.file.tone),
    semitoneShift: source.semitoneShift,
    recommendation,
    reason: `${classified.reason} Projeção ${direction} a partir de ${normalizeTone(source.file.tone) ?? source.file.tone}.`,
  };
}

function summarizeToneCompatibility(tone: CanonicalTone, voices: VoiceToneCompatibility[]): GroupToneCompatibility {
  const compatibility = clampCompatibility(voices.reduce((sum, voice) => sum + voice.compatibility, 0) / Math.max(1, voices.length));
  const worst = voices.reduce<HarmomusIaStatus>((current, voice) => (
    HARMOMUS_STATUS_WEIGHT[voice.status] < HARMOMUS_STATUS_WEIGHT[current] ? voice.status : current
  ), "ideal");
  const meta = statusMeta(worst);
  const riskyVoices = voices.filter((voice) => voice.status === "reorganize").map((voice) => voice.label);
  const limitVoices = voices.filter((voice) => voice.status === "comfortable-limit").map((voice) => voice.label);

  const recommendation = riskyVoices.length > 0
    ? `Reorganização recomendada para ${riskyVoices.join(", ")}.`
    : limitVoices.length > 0
      ? `Tom utilizável, com atenção para ${limitVoices.join(", ")}.`
      : "Tom ideal para soprano, contralto e tenor.";

  const reason = riskyVoices.length > 0
    ? `Compatibilidade média de ${compatibility}% porque um ou mais nipes saem da extensão segura.`
    : limitVoices.length > 0
      ? `Compatibilidade média de ${compatibility}%: todos cabem, mas há nipes próximos ao limite confortável.`
      : `Compatibilidade média de ${compatibility}% com as linhas dentro da zona confortável dos três nipes.`;

  return {
    tone,
    status: worst,
    ...meta,
    compatibility,
    recommendation,
    reason,
    voices,
  };
}

export function evaluateGroupTessituraForTone(files: TessituraSourceFile[], tone: string): GroupToneCompatibility | null {
  if (files.length === 0) return null;

  const normalizedTone = normalizeTone(tone);
  if (!normalizedTone) return null;

  const voices = GROUP_VOICES.map((voice) => buildVoiceCompatibility(files, voice, normalizedTone));
  return summarizeToneCompatibility(normalizedTone, voices);
}

export function findBestToneForGroup(files: TessituraSourceFile[]): BestToneForGroupRecommendation | null {
  if (files.length === 0) return null;

  const evaluatedTones = CHROMATIC_TONES_SHARP
    .map((tone) => evaluateGroupTessituraForTone(files, tone))
    .filter((tone): tone is GroupToneCompatibility => Boolean(tone));

  if (evaluatedTones.length === 0) return null;

  const best = evaluatedTones.reduce((currentBest, candidate) => {
    if (candidate.compatibility !== currentBest.compatibility) {
      return candidate.compatibility > currentBest.compatibility ? candidate : currentBest;
    }
    if (HARMOMUS_STATUS_WEIGHT[candidate.status] !== HARMOMUS_STATUS_WEIGHT[currentBest.status]) {
      return HARMOMUS_STATUS_WEIGHT[candidate.status] > HARMOMUS_STATUS_WEIGHT[currentBest.status] ? candidate : currentBest;
    }
    return candidate.tone < currentBest.tone ? candidate : currentBest;
  }, evaluatedTones[0]);

  const idealVoices = best.voices.filter((voice) => voice.status === "ideal").map((voice) => voice.label);
  const limitedVoices = best.voices.filter((voice) => voice.status === "comfortable-limit").map((voice) => voice.label);
  const reorganizeVoices = best.voices.filter((voice) => voice.status === "reorganize").map((voice) => voice.label);

  const details = [
    idealVoices.length ? `${idealVoices.join(", ")} em zona ideal` : null,
    limitedVoices.length ? `${limitedVoices.join(", ")} em limite confortável` : null,
    reorganizeVoices.length ? `${reorganizeVoices.join(", ")} pedindo reorganização` : null,
  ].filter(Boolean).join("; ");

  return {
    ...best,
    evaluatedTones,
    justification: details ? `Escolhido por equilibrar os nipes: ${details}.` : best.reason,
  };
}
