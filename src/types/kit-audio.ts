export interface KitAudioFile {
  name: string;
  key: string;
  url: string;
  tone: string;
  voice: "todos" | "soprano" | "contralto" | "tenor";
  fileType: string;
}

export interface KitAudioToneGroup {
  tone: string;
  files: KitAudioFile[];
}
