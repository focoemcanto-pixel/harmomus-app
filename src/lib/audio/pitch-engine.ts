export interface PitchPlaybackRequest {
  audio: HTMLAudioElement;
  semitoneShift: number;
}

export interface PitchPlaybackController {
  play(): Promise<void>;
  pause(): void;
  dispose(): void;
  setSemitoneShift(value: number): void;
}

export interface PitchEngine {
  createPlayback(request: PitchPlaybackRequest): Promise<PitchPlaybackController>;
}

class NativePlaybackController implements PitchPlaybackController {
  constructor(private readonly audio: HTMLAudioElement, private semitoneShift: number) {}

  async play() {
    await this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  dispose() {
    this.audio.pause();
  }

  setSemitoneShift(value: number) {
    this.semitoneShift = value;
  }
}

class BrowserPitchEngine implements PitchEngine {
  async createPlayback(request: PitchPlaybackRequest): Promise<PitchPlaybackController> {
    const { audio, semitoneShift } = request;

    // Camada inicial da engine.
    // A integração SoundTouch/WebAudio será adicionada sem alterar o player.
    return new NativePlaybackController(audio, semitoneShift);
  }
}

let singleton: PitchEngine | null = null;

export function getPitchEngine(): PitchEngine {
  if (!singleton) singleton = new BrowserPitchEngine();
  return singleton;
}
