declare module "soundtouchjs" {
  export class SoundTouch {
    constructor(sampleRate: number);
    pitch: number;
  }

  export class BufferSource {
    constructor(audioBuffer: AudioBuffer);
  }

  export class SimpleFilter {
    constructor(source: unknown, soundTouch: SoundTouch);
    sourcePosition?: number;
  }

  export function getWebAudioNode(context: AudioContext, filter: SimpleFilter): AudioNode;
}
