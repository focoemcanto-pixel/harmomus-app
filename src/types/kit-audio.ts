export interface KitAudioFile {
  id?: string;
  name: string;
  key: string;
  url: string;
  tone: string;
  voice: "todos" | "soprano" | "contralto" | "tenor";
  fileType: string;
  minMidiNote?: number | null;
  maxMidiNote?: number | null;
  detectedMinMidiNote?: number | null;
  detectedMaxMidiNote?: number | null;
  tessituraConfidence?: number | null;
  tessituraSource?: "manual" | "auto" | "hybrid";
}

export interface KitAudioToneGroup {
  tone: string;
  files: KitAudioFile[];
}
