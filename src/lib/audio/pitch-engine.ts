export interface PitchPlaybackRequest {
  audio: HTMLAudioElement;
  semitoneShift: number;
  signal?: AbortSignal;
}

export interface PitchPlaybackController {
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  setSemitoneShift(value: number): void;
  dispose(): void;
}

class NativePlaybackController implements PitchPlaybackController {
  constructor(private readonly audio: HTMLAudioElement) {}

  async play() {
    await this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  setSemitoneShift() {
    // Modulação realtime removida: mantemos método para compatibilidade de API.
  }

  dispose() {
    this.pause();
  }
}

class PitchEngine {
  async createPlayback(request: PitchPlaybackRequest): Promise<PitchPlaybackController> {
    return new NativePlaybackController(request.audio);
  }
}

let singleton: PitchEngine | null = null;

export function getPitchEngine(): PitchEngine {
  if (!singleton) singleton = new PitchEngine();
  return singleton;
}
