import { noteToMidi } from "@/lib/music-notes";

export type VocalProfileType = "tenor" | "contralto" | "soprano";

export interface VocalProfile {
  type: VocalProfileType;
  label: string;
  absoluteMin: string;
  absoluteMax: string;
  comfortMin: string;
  comfortMax: string;
  absoluteMinMidi: number;
  absoluteMaxMidi: number;
  comfortMinMidi: number;
  comfortMaxMidi: number;
  warningMargin: number;
}

function requiredMidi(note: string): number {
  const midi = noteToMidi(note);
  if (midi === null) throw new Error(`Invalid vocal profile note: ${note}`);
  return midi;
}

function brToSpn(note: string) {
  return note.replace(/(-?\d+)$/, (octave) => String(Number(octave) + 1));
}

function createProfile(profile: Omit<VocalProfile, "absoluteMinMidi" | "absoluteMaxMidi" | "comfortMinMidi" | "comfortMaxMidi">): VocalProfile {
  return {
    ...profile,
    absoluteMinMidi: requiredMidi(brToSpn(profile.absoluteMin)),
    absoluteMaxMidi: requiredMidi(brToSpn(profile.absoluteMax)),
    comfortMinMidi: requiredMidi(brToSpn(profile.comfortMin)),
    comfortMaxMidi: requiredMidi(brToSpn(profile.comfortMax)),
  };
}

export const VOCAL_PROFILES: Record<VocalProfileType, VocalProfile> = {
  tenor: createProfile({
    type: "tenor",
    label: "Tenor",
    comfortMin: "A1",
    comfortMax: "G3",
    absoluteMin: "G1",
    absoluteMax: "A3",
    warningMargin: 0,
  }),
  contralto: createProfile({
    type: "contralto",
    label: "Contralto",
    comfortMin: "E2",
    comfortMax: "C4",
    absoluteMin: "D2",
    absoluteMax: "E4",
    warningMargin: 0,
  }),
  soprano: createProfile({
    type: "soprano",
    label: "Soprano",
    comfortMin: "A2",
    comfortMax: "E4",
    absoluteMin: "G2",
    absoluteMax: "G4",
    warningMargin: 0,
  }),
};

export function getVocalProfile(voiceType: string): VocalProfile | null {
  return VOCAL_PROFILES[voiceType as VocalProfileType] ?? null;
}
