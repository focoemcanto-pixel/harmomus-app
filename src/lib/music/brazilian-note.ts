const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  DB: 1,
  D: 2,
  "D#": 3,
  EB: 3,
  E: 4,
  F: 5,
  "F#": 6,
  GB: 6,
  G: 7,
  "G#": 8,
  AB: 8,
  A: 9,
  "A#": 10,
  BB: 10,
  B: 11,
};

const SOLFEGE_TO_NOTE: Record<string, string> = {
  DO: "C",
  RE: "D",
  MI: "E",
  FA: "F",
  SOL: "G",
  LA: "A",
  SI: "B",
};

export function normalizeBrazilianNote(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/♯/g, "#")
    .replace(/＃/g, "#")
    .replace(/♭/g, "b")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeNoteToken(value: string) {
  let normalized = normalizeBrazilianNote(value);

  for (const [solfege, note] of Object.entries(SOLFEGE_TO_NOTE)) {
    if (normalized.startsWith(solfege)) {
      normalized = `${note}${normalized.slice(solfege.length)}`;
      break;
    }
  }

  return normalized;
}

export function brazilianNoteToMidi(value: string): number | null {
  const normalized = normalizeNoteToken(value);
  const match = normalized.match(/^([A-G])([#B]?)(-?\d+)$/);
  if (!match) return null;

  const [, letter, accidental, octaveValue] = match;
  const semitone = NOTE_TO_SEMITONE[`${letter}${accidental}`];
  if (typeof semitone !== "number") return null;

  const octave = Number(octaveValue);
  if (!Number.isFinite(octave)) return null;

  const internationalOctave = octave + 1;
  return (internationalOctave + 1) * 12 + semitone;
}

export function midiToBrazilianNoteName(midi: number) {
  const roundedMidi = Math.round(midi);
  const note = NOTE_NAMES[((roundedMidi % 12) + 12) % 12];
  const internationalOctave = Math.floor(roundedMidi / 12) - 1;
  return `${note}${internationalOctave - 1}`;
}
