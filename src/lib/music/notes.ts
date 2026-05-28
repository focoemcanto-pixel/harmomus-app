export function midiToNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function spnToBrazilianNote(note: string): string {
  return note.replace(/(-?\d+)$/, (octave) => String(Number(octave) - 1));
}

export function midiToBrazilianNote(midi: number): string {
  return spnToBrazilianNote(midiToNoteName(midi));
}
