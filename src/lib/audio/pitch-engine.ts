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

type SoundTouchModule = {
  SoundTouch: new (sampleRate: number) => { pitch: number };
  SimpleFilter: new (source: unknown, soundTouch: unknown) => { sourcePosition?: number };
  BufferSource: new (audioBuffer: AudioBuffer) => unknown;
  getWebAudioNode: (context: AudioContext, filter: unknown) => AudioNode;
};

class SoundTouchPlaybackController implements PitchPlaybackController {
  private context: AudioContext | null = null;
  private output: AudioNode | null = null;
  private filter: { sourcePosition?: number } | null = null;
  private decodedBuffer: AudioBuffer | null = null;
  private startOffsetSec = 0;
  private startedAt = 0;

  constructor(private readonly audio: HTMLAudioElement, private semitoneShift: number, private readonly soundTouchModule: SoundTouchModule) {}

  private async ensureDecodedBuffer() {
    if (this.decodedBuffer) return;
    const src = this.audio.currentSrc || this.audio.src;
    if (!src) throw new Error("Missing audio source");
    const response = await fetch(src);
    const arr = await response.arrayBuffer();
    const decodeContext = new AudioContext();
    try {
      this.decodedBuffer = await decodeContext.decodeAudioData(arr);
    } finally {
      await decodeContext.close();
    }
  }

  private async startGraph() {
    await this.ensureDecodedBuffer();
    if (!this.decodedBuffer) return;

    this.context = new AudioContext();
    const st = new this.soundTouchModule.SoundTouch(this.decodedBuffer.sampleRate);
    st.pitch = 2 ** (this.semitoneShift / 12);
    const source = new this.soundTouchModule.BufferSource(this.decodedBuffer);
    this.filter = new this.soundTouchModule.SimpleFilter(source, st);

    if (this.startOffsetSec > 0 && this.filter) {
      this.filter.sourcePosition = Math.floor(this.startOffsetSec * this.decodedBuffer.sampleRate);
    }

    this.output = this.soundTouchModule.getWebAudioNode(this.context, this.filter);
    this.output.connect(this.context.destination);
    this.startedAt = this.context.currentTime;
  }

  async play() {
    if (this.context) {
      await this.context.resume();
      return;
    }
    await this.startGraph();
  }

  pause() {
    if (!this.context) return;
    if (this.filter && this.decodedBuffer) {
      const samplePos = this.filter.sourcePosition ?? 0;
      this.startOffsetSec = samplePos / this.decodedBuffer.sampleRate;
    } else {
      this.startOffsetSec += this.context.currentTime - this.startedAt;
    }
    this.context.close().catch(() => undefined);
    this.context = null;
    this.output = null;
  }

  dispose() {
    this.pause();
    this.decodedBuffer = null;
    this.startOffsetSec = 0;
  }

  setSemitoneShift(value: number) {
    this.semitoneShift = value;
    if (this.context) {
      this.pause();
      void this.play();
    }
  }
}

class BrowserPitchEngine implements PitchEngine {
  private soundTouchModulePromise: Promise<SoundTouchModule | null> | null = null;

  private loadSoundTouch() {
    if (!this.soundTouchModulePromise) {
      this.soundTouchModulePromise = this.loadFromWindow();
    }
    return this.soundTouchModulePromise;
  }


  private async loadFromWindow(): Promise<SoundTouchModule | null> {
    if (typeof window === "undefined") return null;
    const w = window as Window & { soundtouch?: SoundTouchModule };
    if (w.soundtouch) return w.soundtouch;

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-soundtouchjs="1"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load soundtouchjs")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://unpkg.com/soundtouchjs@0.1.30/dist/soundtouch.js";
      script.async = true;
      script.dataset.soundtouchjs = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load soundtouchjs"));
      document.head.appendChild(script);
    }).catch((error) => {
      console.error("[PitchEngine] Failed to load soundtouchjs", error);
    });

    return (window as Window & { soundtouch?: SoundTouchModule }).soundtouch ?? null;
  }
  async createPlayback(request: PitchPlaybackRequest): Promise<PitchPlaybackController> {
    const { audio, semitoneShift } = request;

    if (typeof window === "undefined" || semitoneShift === 0) {
      return new NativePlaybackController(audio, semitoneShift);
    }

    const st = await this.loadSoundTouch();
    if (!st) return new NativePlaybackController(audio, semitoneShift);

    try {
      return new SoundTouchPlaybackController(audio, Math.max(-3, Math.min(3, semitoneShift)), st);
    } catch (error) {
      console.error("[PitchEngine] Failed to create shifted playback", error);
      return new NativePlaybackController(audio, semitoneShift);
    }
  }
}

let singleton: PitchEngine | null = null;

export function getPitchEngine(): PitchEngine {
  if (!singleton) singleton = new BrowserPitchEngine();
  return singleton;
}
