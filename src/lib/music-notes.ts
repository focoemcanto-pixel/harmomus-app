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

export function noteToMidi(note: string): number | null {
  const match = note.trim().toUpperCase().match(/^([A-G])([#B]?)(-?\d+)$/);
  if (!match) return null;

  const [, letter, accidental, octaveValue] = match;
  const semitone = NOTE_TO_SEMITONE[`${letter}${accidental}`];
  if (typeof semitone !== "number") return null;

  return (Number(octaveValue) + 1) * 12 + semitone;
}

export function midiToSpnNote(midi: number): string {
  const roundedMidi = Math.round(midi);
  const note = NOTE_NAMES[((roundedMidi % 12) + 12) % 12];
  const octave = Math.floor(roundedMidi / 12) - 1;
  return `${note}${octave}`;
}

export function midiToBrazilianNote(midi: number): string {
  return spnToBrazilianNote(midiToSpnNote(midi));
}

export function spnToBrazilianNote(note: string): string {
  return note.replace(/(-?\d+)$/, (octave) => String(Number(octave) - 1));
}
