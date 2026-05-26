export interface PitchPlaybackRequest {
  audio: HTMLAudioElement;
  semitoneShift: number;
  signal?: AbortSignal;
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Playback aborted", "AbortError");
}

class NativePlaybackController implements PitchPlaybackController {
  private disposed = false;

  constructor(private readonly audio: HTMLAudioElement, private semitoneShift: number) {}

  async play() {
    if (this.disposed) return;
    await this.audio.play();
  }

  pause() {
    try { this.audio.pause(); } catch {}
  }

  dispose() {
    this.disposed = true;
    this.pause();
  }

  setSemitoneShift(value: number) {
    this.semitoneShift = value;
  }
}

type SoundTouchModule = {
  SoundTouch: new (sampleRate: number) => { pitch: number };
  SimpleFilter: new (source: unknown, soundTouch: unknown) => { sourcePosition?: number };
  WebAudioBufferSource: new (audioBuffer: AudioBuffer) => unknown;
  getWebAudioNode: (
    context: AudioContext,
    filter: unknown,
    sourcePositionCallback?: (sourcePosition: number) => void,
    bufferSize?: number,
  ) => AudioNode;
};

class SoundTouchPlaybackController implements PitchPlaybackController {
  private context: AudioContext | null = null;
  private output: AudioNode | null = null;
  private filter: { sourcePosition?: number } | null = null;
  private decodedBuffer: AudioBuffer | null = null;
  private startOffsetSec = 0;
  private disposed = false;
  private readonly sourceUrl: string;

  constructor(
    private readonly audio: HTMLAudioElement,
    private semitoneShift: number,
    private readonly soundTouchModule: SoundTouchModule,
    private readonly signal?: AbortSignal,
  ) {
    this.sourceUrl = audio.currentSrc || audio.src;
  }

  private async ensureDecodedBuffer() {
    throwIfAborted(this.signal);
    if (this.disposed) throw new DOMException("Playback disposed", "AbortError");
    if (this.decodedBuffer) return;

    if (!this.sourceUrl) throw new Error("Missing audio source");

    try { this.audio.pause(); } catch {}
    this.audio.muted = true;

    const response = await fetch(this.sourceUrl, { cache: "force-cache", signal: this.signal });
    throwIfAborted(this.signal);
    if (this.disposed) throw new DOMException("Playback disposed", "AbortError");

    if (!response.ok) throw new Error("Failed to fetch audio for pitch shifting");

    const arr = await response.arrayBuffer();
    throwIfAborted(this.signal);
    if (this.disposed) throw new DOMException("Playback disposed", "AbortError");

    const decodeContext = new AudioContext();
    try {
      this.decodedBuffer = await decodeContext.decodeAudioData(arr.slice(0));
      throwIfAborted(this.signal);
      if (this.disposed) throw new DOMException("Playback disposed", "AbortError");
    } finally {
      await decodeContext.close().catch(() => undefined);
    }
  }

  private async startGraph() {
    throwIfAborted(this.signal);
    if (this.disposed) return;
    await this.ensureDecodedBuffer();

    if (!this.decodedBuffer || this.disposed) return;
    throwIfAborted(this.signal);

    this.context = new AudioContext();

    const soundTouch = new this.soundTouchModule.SoundTouch(this.decodedBuffer.sampleRate);
    soundTouch.pitch = 2 ** (this.semitoneShift / 12);

    const source = new this.soundTouchModule.WebAudioBufferSource(this.decodedBuffer);
    this.filter = new this.soundTouchModule.SimpleFilter(source, soundTouch);

    if (this.startOffsetSec > 0 && this.filter) {
      this.filter.sourcePosition = Math.floor(this.startOffsetSec * this.decodedBuffer.sampleRate);
    }

    this.output = this.soundTouchModule.getWebAudioNode(
      this.context,
      this.filter,
      (sourcePosition) => {
        if (!this.decodedBuffer || this.disposed || this.signal?.aborted) return;
        this.startOffsetSec = sourcePosition / this.decodedBuffer.sampleRate;
        try { this.audio.currentTime = this.startOffsetSec; } catch {}
      },
      2048,
    );

    throwIfAborted(this.signal);
    if (this.disposed) return;
    this.output.connect(this.context.destination);
  }

  async play() {
    throwIfAborted(this.signal);
    if (this.disposed) return;

    if (this.context) {
      await this.context.resume();
      return;
    }

    await this.startGraph();
  }

  pause() {
    if (!this.context) return;
    const context = this.context;
    this.context = null;
    try { this.output?.disconnect(); } catch {}
    this.output = null;
    context.close().catch(() => undefined);
  }

  dispose() {
    this.disposed = true;
    this.pause();
    this.decodedBuffer = null;
    this.filter = null;
    this.startOffsetSec = 0;
    try { this.audio.muted = false; } catch {}
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
    if (!this.soundTouchModulePromise) this.soundTouchModulePromise = this.loadFromPackage();
    return this.soundTouchModulePromise;
  }

  private async loadFromPackage(): Promise<SoundTouchModule | null> {
    if (typeof window === "undefined") return null;

    try {
      return (await import("soundtouchjs")) as unknown as SoundTouchModule;
    } catch (error) {
      console.error("[PitchEngine] Failed to import bundled soundtouchjs", error);
      return null;
    }
  }

  async createPlayback(request: PitchPlaybackRequest): Promise<PitchPlaybackController> {
    const { audio, semitoneShift, signal } = request;
    throwIfAborted(signal);

    if (typeof window === "undefined" || semitoneShift === 0) {
      return new NativePlaybackController(audio, semitoneShift);
    }

    const st = await this.loadSoundTouch();
    throwIfAborted(signal);

    if (!st) throw new Error("Pitch shifting indisponível: soundtouchjs não foi carregado.");

    return new SoundTouchPlaybackController(audio, Math.max(-3, Math.min(3, semitoneShift)), st, signal);
  }
}

let singleton: PitchEngine | null = null;

export function getPitchEngine(): PitchEngine {
  if (!singleton) singleton = new BrowserPitchEngine();
  return singleton;
}
