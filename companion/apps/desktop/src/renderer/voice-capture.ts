import { encodeWav, resampleLinear, rms } from '@companion/core/voice/audio';
import { SpeechSegmenter } from '@companion/core/voice/segmenter';

export interface VoiceCaptureCallbacks {
  onSpeechStart: () => void;
  onUtterance: (audio: string, mimeType: string, durationMs: number) => void;
  onError: (message: string) => void;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export class VoiceCapture {
  private readonly callbacks: VoiceCaptureCallbacks;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private segmenter = new SpeechSegmenter({ threshold: 0.02 });
  private running = false;
  private paused = false;
  private calibratingUntil = 0;
  private noiseFloor = 0.004;
  private threshold = 0.02;

  constructor(callbacks: VoiceCaptureCallbacks) {
    this.callbacks = callbacks;
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      this.context = new AudioContext({ sampleRate: 48000 });
      if (this.context.state === 'suspended') await this.context.resume();
      this.source = this.context.createMediaStreamSource(this.stream);
      this.processor = this.context.createScriptProcessor(4096, 1, 1);
      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.processor.onaudioprocess = (event) => {
        this.handle(event.inputBuffer.getChannelData(0), this.context?.sampleRate ?? 48000);
      };
      this.source.connect(this.processor);
      this.processor.connect(this.sink);
      this.sink.connect(this.context.destination);
      this.calibratingUntil = performance.now() + 650;
      this.segmenter.reset();
    } catch (error) {
      this.running = false;
      await this.release();
      throw error;
    }
  }

  pause(): void {
    this.paused = true;
    this.segmenter.reset();
  }

  resume(): void {
    if (!this.running) return;
    this.paused = false;
    this.segmenter.reset();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.paused = false;
    this.segmenter.reset();
    await this.release();
  }

  private handle(samples: Float32Array, sampleRate: number): void {
    if (!this.running || this.paused) return;
    const now = performance.now();
    if (now < this.calibratingUntil) {
      const level = rms(samples);
      if (level < 0.02) this.noiseFloor = this.noiseFloor * 0.8 + level * 0.2;
      this.threshold = Math.max(0.01, Math.min(0.06, this.noiseFloor * 2.8));
      return;
    }
    const level = rms(samples);
    if (!this.segmenter.isSpeaking && level < this.threshold) {
      this.noiseFloor = this.noiseFloor * 0.995 + level * 0.005;
      this.threshold = Math.max(0.01, Math.min(0.06, this.noiseFloor * 2.8));
    }
    this.segmenter.setThreshold(this.threshold);
    const result = this.segmenter.push(samples, sampleRate, now);
    if (result === 'started') this.callbacks.onSpeechStart();
    if (result === 'ended') this.emit();
  }

  private emit(): void {
    const segment = this.segmenter.take();
    if (!segment || segment.sampleRate <= 0) return;
    const durationMs = (segment.samples.length / segment.sampleRate) * 1000;
    if (durationMs < 250) return;
    const samples = resampleLinear(segment.samples, segment.sampleRate, 16000);
    const wav = encodeWav(samples, 16000);
    this.callbacks.onUtterance(toBase64(wav), 'audio/wav', Math.round(durationMs));
  }

  private async release(): Promise<void> {
    if (this.processor) this.processor.onaudioprocess = null;
    try { this.source?.disconnect(); } catch { /* already disconnected */ }
    try { this.processor?.disconnect(); } catch { /* already disconnected */ }
    try { this.sink?.disconnect(); } catch { /* already disconnected */ }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.source = null;
    this.processor = null;
    this.sink = null;
    this.stream = null;
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
  }
}
