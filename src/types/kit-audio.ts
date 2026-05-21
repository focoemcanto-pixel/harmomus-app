export interface KitAudioFile {
  name: string;
  key: string;
  url: string;
  tone: string;
  fileType: string;
}

export interface KitAudioToneGroup {
  tone: string;
  files: KitAudioFile[];
}
