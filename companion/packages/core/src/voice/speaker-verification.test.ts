import { describe, expect, it } from 'vitest';
import { SpeakerVerification } from './speaker-verification.js';

describe('Speaker Verification (G016 - Degraded Mode)', () => {
  it('returns true when disabled', async () => {
    const sv = new SpeakerVerification({ enabled: false, enrollmentComplete: false, sampleCount: 0 });
    const result = await sv.verify(new ArrayBuffer(100));
    expect(result.isOwner).toBe(true);
    expect(result.confidence).toBe(1.0);
    expect(result.degraded).toBe(false);
  });

  it('returns degraded mode when enabled but not enrolled', async () => {
    const sv = new SpeakerVerification({ enabled: true, enrollmentComplete: false, sampleCount: 0 });
    const result = await sv.verify(new ArrayBuffer(100));
    expect(result.isOwner).toBe(true);
    expect(result.confidence).toBe(0.5);
    expect(result.degraded).toBe(true);
  });

  it('enrolls samples and tracks count', async () => {
    const sv = new SpeakerVerification({ enabled: true, enrollmentComplete: false, sampleCount: 0 });
    const result1 = await sv.enrollSample(new ArrayBuffer(100));
    expect(result1.success).toBe(true);
    expect(result1.sampleCount).toBe(1);
    expect(result1.needsMore).toBe(true);

    const result2 = await sv.enrollSample(new ArrayBuffer(100));
    expect(result2.sampleCount).toBe(2);

    // After 5 samples, enrollment is complete
    for (let i = 0; i < 3; i++) {
      await sv.enrollSample(new ArrayBuffer(100));
    }
    const config = sv.getConfig();
    expect(config.enrollmentComplete).toBe(true);
    expect(config.sampleCount).toBe(5);
  });

  it('resets enrollment', () => {
    const sv = new SpeakerVerification({ enabled: true, enrollmentComplete: true, sampleCount: 5 });
    sv.resetEnrollment();
    const config = sv.getConfig();
    expect(config.enrollmentComplete).toBe(false);
    expect(config.sampleCount).toBe(0);
  });

  it('updates config', () => {
    const sv = new SpeakerVerification({ enabled: false, enrollmentComplete: false, sampleCount: 0 });
    sv.updateConfig({ enabled: true });
    const config = sv.getConfig();
    expect(config.enabled).toBe(true);
  });
});
