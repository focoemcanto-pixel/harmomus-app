export const CHROMATIC_TONES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export type CanonicalTone = (typeof CHROMATIC_TONES_SHARP)[number];

const FLAT_TO_SHARP: Record<string, CanonicalTone> = {
  DB: "C#",
  EB: "D#",
  GB: "F#",
  AB: "G#",
  BB: "A#",
};

const TONE_LABELS_PT_BR: Record<CanonicalTone, string> = {
  C: "Dó",
  "C#": "Dó#",
  D: "Ré",
  "D#": "Ré#",
  E: "Mi",
  F: "Fá",
  "F#": "Fá#",
  G: "Sol",
  "G#": "Sol#",
  A: "Lá",
  "A#": "Lá#",
  B: "Si",
};

const NATURAL_TONES = new Set<CanonicalTone>(["C", "D", "E", "F", "G", "A", "B"]);

export interface ToneResolution<TTrack> {
  requestedTone: CanonicalTone | null;
  sourceTone: CanonicalTone | null;
  semitoneShift: number;
  isExact: boolean;
  isPitchShifted: boolean;
  isAvailable: boolean;
  reason: "exact" | "pitch-shift" | "disabled" | "out-of-range" | "invalid-tone" | "no-source";
  sourceTrack: TTrack | null;
}

export function normalizeTone(value: string | null | undefined): CanonicalTone | null {
  if (!value) return null;
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .trim()
    .toUpperCase();

  if (!cleaned) return null;
  if (CHROMATIC_TONES_SHARP.includes(cleaned as CanonicalTone)) return cleaned as CanonicalTone;
  if (FLAT_TO_SHARP[cleaned]) return FLAT_TO_SHARP[cleaned];
  if (NATURAL_TONES.has(cleaned as CanonicalTone)) return cleaned as CanonicalTone;
  return null;
}

export function formatToneLabel(value: string | null | undefined, options: { compact?: boolean } = {}): string {
  const normalized = normalizeTone(value);
  if (!normalized) return value?.trim() || "—";

  const noteName = TONE_LABELS_PT_BR[normalized];
  if (options.compact) return `${normalized} (${noteName})`;
  return `${normalized} (${noteName})`;
}

export function toneToSemitone(value: string | null | undefined): number | null {
  const normalized = normalizeTone(value);
  if (!normalized) return null;
  const index = CHROMATIC_TONES_SHARP.indexOf(normalized);
  return index >= 0 ? index : null;
}

export function getSignedSemitoneDistance(fromTone: string, toTone: string): number | null {
  const from = toneToSemitone(fromTone);
  const to = toneToSemitone(toTone);
  if (from === null || to === null) return null;

  const raw = to - from;
  if (raw > 6) return raw - 12;
  if (raw < -6) return raw + 12;
  return raw;
}

export function sortTonesByChromaticOrder(tones: string[]): CanonicalTone[] {
  const unique = new Set<CanonicalTone>();
  for (const tone of tones) {
    const normalized = normalizeTone(tone);
    if (normalized) unique.add(normalized);
  }
  return CHROMATIC_TONES_SHARP.filter((tone) => unique.has(tone));
}

export function pickInitialTone({
  availableTones,
  defaultTone,
  originalTone,
}: {
  availableTones: string[];
  defaultTone?: string | null;
  originalTone?: string | null;
}): CanonicalTone | "" {
  const normalizedAvailable = sortTonesByChromaticOrder(availableTones);
  if (normalizedAvailable.length === 0) return "";

  const preferredDefault = normalizeTone(defaultTone);
  if (preferredDefault && normalizedAvailable.includes(preferredDefault)) return preferredDefault;

  const preferredOriginal = normalizeTone(originalTone);
  if (preferredOriginal && normalizedAvailable.includes(preferredOriginal)) return preferredOriginal;

  return normalizedAvailable[0];
}

export function resolveToneTrack<TTrack extends { tone: string }>({
  tracks,
  requestedTone,
  allowPitchShift = false,
  maxPitchShiftSemitones = 2,
  pickTrack,
}: {
  tracks: TTrack[];
  requestedTone: string;
  allowPitchShift?: boolean;
  maxPitchShiftSemitones?: number;
  pickTrack?: (toneTracks: TTrack[]) => TTrack | null;
}): ToneResolution<TTrack> {
  const normalizedRequestedTone = normalizeTone(requestedTone);
  const boundedMaxShift = Math.max(0, Math.min(12, Math.round(maxPitchShiftSemitones)));
  const chooseTrack = pickTrack ?? ((toneTracks: TTrack[]) => toneTracks[0] ?? null);

  if (!normalizedRequestedTone) {
    return {
      requestedTone: null,
      sourceTone: null,
      semitoneShift: 0,
      isExact: false,
      isPitchShifted: false,
      isAvailable: false,
      reason: "invalid-tone",
      sourceTrack: null,
    };
  }

  const exactTracks = tracks.filter((track) => normalizeTone(track.tone) === normalizedRequestedTone);
  const exactTrack = chooseTrack(exactTracks);
  if (exactTrack) {
    return {
      requestedTone: normalizedRequestedTone,
      sourceTone: normalizedRequestedTone,
      semitoneShift: 0,
      isExact: true,
      isPitchShifted: false,
      isAvailable: true,
      reason: "exact",
      sourceTrack: exactTrack,
    };
  }

  if (!allowPitchShift) {
    return {
      requestedTone: normalizedRequestedTone,
      sourceTone: null,
      semitoneShift: 0,
      isExact: false,
      isPitchShifted: false,
      isAvailable: false,
      reason: "disabled",
      sourceTrack: null,
    };
  }

  let best: { track: TTrack; sourceTone: CanonicalTone; distance: number } | null = null;
  for (const track of tracks) {
    const sourceTone = normalizeTone(track.tone);
    if (!sourceTone) continue;
    const distance = getSignedSemitoneDistance(sourceTone, normalizedRequestedTone);
    if (distance === null) continue;
    const absoluteDistance = Math.abs(distance);
    if (absoluteDistance === 0) continue;
    if (!best || absoluteDistance < Math.abs(best.distance)) {
      best = { track, sourceTone, distance };
    }
  }

  if (!best) {
    return {
      requestedTone: normalizedRequestedTone,
      sourceTone: null,
      semitoneShift: 0,
      isExact: false,
      isPitchShifted: false,
      isAvailable: false,
      reason: "no-source",
      sourceTrack: null,
    };
  }

  if (Math.abs(best.distance) > boundedMaxShift) {
    return {
      requestedTone: normalizedRequestedTone,
      sourceTone: best.sourceTone,
      semitoneShift: best.distance,
      isExact: false,
      isPitchShifted: false,
      isAvailable: false,
      reason: "out-of-range",
      sourceTrack: best.track,
    };
  }

  return {
    requestedTone: normalizedRequestedTone,
    sourceTone: best.sourceTone,
    semitoneShift: best.distance,
    isExact: false,
    isPitchShifted: true,
    isAvailable: true,
    reason: "pitch-shift",
    sourceTrack: best.track,
  };
}
