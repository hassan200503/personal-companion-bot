/**
 * Speaker Verification (Degraded Mode)
 *
 * This module provides consent-gated speaker verification as specified in G016.
 * In the current implementation, it operates in degraded mode (no on-device ML model).
 * When a model is available in the future, this can be upgraded to full verification.
 *
 * Per G016 architecture:
 * - OPTIONAL: Must be consent-gated
 * - On-device model only (no cloud biometrics)
 * - Never sole authorization (defense-in-depth only)
 * - Graceful degradation if model unavailable
 */

export interface SpeakerVerificationConfig {
  enabled: boolean;
  enrollmentComplete: boolean;
  sampleCount: number;
}

export interface VerificationResult {
  isOwner: boolean;
  confidence: number;
  degraded: boolean;
}

export class SpeakerVerification {
  private config: SpeakerVerificationConfig;

  constructor(config: SpeakerVerificationConfig = { enabled: false, enrollmentComplete: false, sampleCount: 0 }) {
    this.config = config;
  }

  /**
   * Verify if the audio is from the owner.
   * In degraded mode (no model), returns true with a warning.
   * This satisfies the "graceful degradation" requirement from G016.
   */
  async verify(audioBuffer: ArrayBuffer): Promise<VerificationResult> {
    console.log(`Verifying audio buffer of size: ${audioBuffer.byteLength} bytes`);
    if (!this.config.enabled) {
      return { isOwner: true, confidence: 1.0, degraded: false };
    }

    if (!this.config.enrollmentComplete || this.config.sampleCount < 5) {
      // Degraded mode: not enough enrollment samples
      return { isOwner: true, confidence: 0.5, degraded: true };
    }

    // Degraded mode: no on-device model available yet
    // When a model is added, replace this with actual embedding extraction
    // and cosine similarity comparison against the owner profile
    return { isOwner: true, confidence: 0.5, degraded: true };
  }

  /**
   * Enroll the owner's voice for future verification.
   * Requires 5+ samples for reliable verification.
   */
  async enrollSample(audioBuffer: ArrayBuffer): Promise<{ success: boolean; sampleCount: number; needsMore: boolean }> {
    console.log(`Enrolling voice sample of size: ${audioBuffer.byteLength} bytes`);
    if (!this.config.enabled) {
      return { success: false, sampleCount: 0, needsMore: false };
    }

    // In degraded mode, just track sample count
    // When a model is added, extract embeddings and save to encrypted profile
    this.config.sampleCount += 1;
    this.config.enrollmentComplete = this.config.sampleCount >= 5;

    return {
      success: true,
      sampleCount: this.config.sampleCount,
      needsMore: this.config.sampleCount < 5
    };
  }

  /**
   * Reset enrollment (e.g., when user opts out or changes voice profile).
   */
  resetEnrollment(): void {
    this.config.sampleCount = 0;
    this.config.enrollmentComplete = false;
  }

  getConfig(): SpeakerVerificationConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<SpeakerVerificationConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}
