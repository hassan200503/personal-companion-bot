import { describe, expect, it } from 'vitest';
import { encodeWav, resampleLinear, rms } from './audio.js';
import { SpeechSegmenter } from './segmenter.js';

describe('voice audio helpers', () => {
  it('calculates RMS for silence and a full-scale tone', () => {
    expect(rms(new Float32Array(64))).toBe(0);
    expect(rms(new Float32Array(64).fill(1))).toBeCloseTo(1);
  });

  it('resamples while preserving duration and range', () => {
    const input = new Float32Array(4800);
    for (let i = 0; i < input.length; i += 1) input[i] = Math.sin((i / 4800) * Math.PI * 2 * 440);
    const output = resampleLinear(input, 48000, 16000);
    expect(output.length).toBe(1600);
    expect(Math.max(...output)).toBeLessThanOrEqual(1);
    expect(Math.min(...output)).toBeGreaterThanOrEqual(-1);
  });

  it('writes a valid mono 16-bit WAV header', () => {
    const wav = encodeWav(new Float32Array(800), 16000);
    const view = new DataView(wav.buffer);
    const text = (offset: number, length: number) => String.fromCharCode(...wav.slice(offset, offset + length));
    expect(wav.length).toBe(44 + 1600);
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(1600);
  });
});

describe('SpeechSegmenter', () => {
  function frame(value: number): Float32Array {
    return new Float32Array(480).fill(value);
  }

  it('waits for sustained speech and ends after silence', () => {
    const segmenter = new SpeechSegmenter({ threshold: 0.02, silenceMs: 60, minSpeechMs: 50, startFrames: 2, preRollMs: 50 });
    expect(segmenter.push(frame(0), 16000, 0)).toBeNull();
    expect(segmenter.push(frame(0.2), 16000, 30)).toBeNull();
    expect(segmenter.push(frame(0.2), 16000, 60)).toBe('started');
    expect(segmenter.push(frame(0.2), 16000, 90)).toBeNull();
    expect(segmenter.push(frame(0), 16000, 120)).toBeNull();
    expect(segmenter.push(frame(0), 16000, 150)).toBe('ended');
    const segment = segmenter.take();
    expect(segment?.sampleRate).toBe(16000);
    expect(segment?.samples.length).toBeGreaterThan(0);
    expect(segmenter.isSpeaking).toBe(false);
  });

  it('does not emit a segment for a short click', () => {
    const segmenter = new SpeechSegmenter({ threshold: 0.02, silenceMs: 100, minSpeechMs: 300, startFrames: 2 });
    segmenter.push(frame(0.2), 16000, 0);
    expect(segmenter.push(frame(0.2), 16000, 30)).toBe('started');
    segmenter.push(frame(0), 16000, 60);
    expect(segmenter.push(frame(0), 16000, 90)).toBeNull();
    expect(segmenter.flush()).toBeNull();
  });
});
