import { rms } from './audio.js';

export interface SpeechSegment {
  samples: Float32Array;
  sampleRate: number;
}

export interface SpeechSegmenterOptions {
  threshold: number;
  preRollMs?: number;
  silenceMs?: number;
  minSpeechMs?: number;
  maxUtteranceMs?: number;
  startFrames?: number;
}

interface Frame {
  samples: Float32Array;
  sampleRate: number;
  at: number;
  durationMs: number;
}

export class SpeechSegmenter {
  private readonly preRollMs: number;
  private readonly silenceMs: number;
  private readonly minSpeechMs: number;
  private readonly maxUtteranceMs: number;
  private readonly startFrames: number;
  private threshold: number;
  private frames: Frame[] = [];
  private speaking = false;
  private aboveMs = 0;
  private voicedMs = 0;
  private quietMs = 0;
  private startAt = 0;

  constructor(options: SpeechSegmenterOptions) {
    this.threshold = options.threshold;
    this.preRollMs = options.preRollMs ?? 400;
    this.silenceMs = options.silenceMs ?? 900;
    this.minSpeechMs = options.minSpeechMs ?? 300;
    this.maxUtteranceMs = options.maxUtteranceMs ?? 20_000;
    this.startFrames = options.startFrames ?? 2;
  }

  setThreshold(threshold: number): void {
    this.threshold = Math.max(0.001, threshold);
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  push(samples: Float32Array, sampleRate: number, now: number): 'started' | 'ended' | null {
    if (samples.length === 0 || sampleRate <= 0) return null;
    const durationMs = (samples.length / sampleRate) * 1000;
    const frame: Frame = { samples: new Float32Array(samples), sampleRate, at: now, durationMs };
    this.frames.push(frame);
    const level = rms(samples);
    if (!this.speaking) {
      if (level >= this.threshold) {
        this.aboveMs += durationMs;
        if (this.aboveMs >= durationMs * this.startFrames) {
          this.speaking = true;
          this.startAt = now - this.aboveMs;
          this.voicedMs = this.aboveMs;
          this.quietMs = 0;
          this.trim(now - this.preRollMs);
          return 'started';
        }
      } else {
        this.aboveMs = 0;
      }
      this.trim(now - this.preRollMs);
      return null;
    }

    this.voicedMs += durationMs;
    if (level >= this.threshold) {
      this.quietMs = 0;
    } else {
      this.quietMs += durationMs;
    }
    if (this.voicedMs - this.quietMs < this.minSpeechMs) return null;
    if (this.quietMs >= this.silenceMs || this.voicedMs >= this.maxUtteranceMs) {
      this.speaking = false;
      return 'ended';
    }
    return null;
  }

  take(): SpeechSegment | null {
    const frames = this.frames.filter((frame) => frame.at >= this.startAt - this.preRollMs);
    this.frames = [];
    this.aboveMs = 0;
    this.voicedMs = 0;
    this.quietMs = 0;
    this.speaking = false;
    this.startAt = 0;
    if (frames.length === 0) return null;
    const sampleRate = frames[0]?.sampleRate ?? 0;
    const length = frames.reduce((total, frame) => total + frame.samples.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const frame of frames) {
      samples.set(frame.samples, offset);
      offset += frame.samples.length;
    }
    return { samples, sampleRate };
  }

  flush(): SpeechSegment | null {
    if (!this.speaking || this.voicedMs - this.quietMs < this.minSpeechMs) {
      this.reset();
      return null;
    }
    return this.take();
  }

  reset(): void {
    this.frames = [];
    this.speaking = false;
    this.aboveMs = 0;
    this.voicedMs = 0;
    this.quietMs = 0;
    this.startAt = 0;
  }

  private trim(threshold: number): void {
    while (this.frames.length > 0 && (this.frames[0]?.at ?? 0) < threshold) this.frames.shift();
  }
}
