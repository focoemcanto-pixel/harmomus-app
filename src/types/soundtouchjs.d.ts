declare module "soundtouchjs" {
  export class SoundTouch {
    constructor(sampleRate: number);
    pitch: number;
    tempo: number;
    rate: number;
  }

  export class WebAudioBufferSource {
    constructor(audioBuffer: AudioBuffer);
  }

  export class SimpleFilter {
    constructor(source: unknown, soundTouch: SoundTouch, callback?: () => void);
    sourcePosition: number;
    position: number;
  }

  export function getWebAudioNode(
    context: AudioContext,
    filter: SimpleFilter,
    sourcePositionCallback?: (sourcePosition: number) => void,
    bufferSize?: number,
  ): AudioNode;
}
