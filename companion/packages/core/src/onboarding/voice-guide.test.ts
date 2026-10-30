import { describe, expect, it } from 'vitest';
import {
  advanceVoiceGuide,
  createVoiceGuideProgress,
  needsVoiceGuide,
  normalizeVoiceGuideProgress,
  speakableGuideLine,
  voiceGuideSteps
} from './voice-guide.js';

describe('voice guide', () => {
  it('starts incomplete when owner name is missing', () => {
    expect(needsVoiceGuide(createVoiceGuideProgress(), '')).toBe(true);
    expect(needsVoiceGuide(createVoiceGuideProgress({ completedAt: '2026-01-01' }), '')).toBe(false);
  });

  it('normalizes unknown progress safely', () => {
    const normalized = normalizeVoiceGuideProgress({ currentStep: 'nope', draft: { companionName: 'Ada' } });
    expect(normalized.currentStep).toBe('welcome');
    expect(normalized.draft.companionName).toBe('Ada');
  });

  it('collects personal details and preferences through the spoken path', () => {
    let progress = createVoiceGuideProgress();
    const answers = [
      'continue',
      'My name is Alex',
      'skip',
      'skip',
      'Call me Nova',
      'Warm and direct, keep answers short',
      'nothing',
      'recommended',
      'yes',
      'continue',
      'open chat'
    ];

    for (const answer of answers) {
      const result = advanceVoiceGuide(progress, answer, { providerConnected: true });
      expect(result.error).toBeUndefined();
      progress = result.progress;
      if (result.done) break;
    }

    expect(progress.completedAt).toBeTruthy();
    expect(progress.draft.ownerName).toBe('Alex');
    expect(progress.draft.companionName).toBe('Nova');
    expect(progress.draft.tone).toBe('direct');
    expect(progress.draft.cloudSpeechConsent).toBe(true);
    expect(progress.draft.privacyPreset).toBe('recommended');
  });

  it('requires a provider before leaving the provider step', () => {
    const progress = createVoiceGuideProgress({ currentStep: 'provider' });
    const blocked = advanceVoiceGuide(progress, 'continue');
    expect(blocked.error).toMatch(/Gemini API key/i);
    const ok = advanceVoiceGuide(progress, 'continue', { providerConnected: true });
    expect(ok.error).toBeUndefined();
    expect(ok.progress.currentStep).toBe('complete');
  });

  it('builds a speakable acknowledgment plus prompt', () => {
    expect(speakableGuideLine('Got it.', 'What should I call you?')).toBe('Got it. What should I call you?');
  });

  it('covers every published step id', () => {
    expect(voiceGuideSteps.map((step) => step.id)).toEqual([
      'welcome',
      'owner_name',
      'owner_phone',
      'owner_dob',
      'companion_name',
      'tone',
      'boundaries',
      'privacy_preset',
      'cloud_speech',
      'provider',
      'complete'
    ]);
  });
});
