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

function createProfile(profile: Omit<VocalProfile, "absoluteMinMidi" | "absoluteMaxMidi" | "comfortMinMidi" | "comfortMaxMidi">): VocalProfile {
  return {
    ...profile,
    absoluteMinMidi: requiredMidi(profile.absoluteMin),
    absoluteMaxMidi: requiredMidi(profile.absoluteMax),
    comfortMinMidi: requiredMidi(profile.comfortMin),
    comfortMaxMidi: requiredMidi(profile.comfortMax),
  };
}

export const VOCAL_PROFILES: Record<VocalProfileType, VocalProfile> = {
  tenor: createProfile({
    type: "tenor",
    label: "Tenor",
    absoluteMin: "C3",
    absoluteMax: "C5",
    comfortMin: "D3",
    comfortMax: "G4",
    warningMargin: 2,
  }),
  contralto: createProfile({
    type: "contralto",
    label: "Contralto",
    absoluteMin: "G2",
    absoluteMax: "G5",
    comfortMin: "G3",
    comfortMax: "D5",
    warningMargin: 2,
  }),
  soprano: createProfile({
    type: "soprano",
    label: "Soprano",
    absoluteMin: "C3",
    absoluteMax: "C6",
    comfortMin: "C4",
    comfortMax: "E5",
    warningMargin: 2,
  }),
};

export function getVocalProfile(voiceType: string): VocalProfile | null {
  return VOCAL_PROFILES[voiceType as VocalProfileType] ?? null;
}
