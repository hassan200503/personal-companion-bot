import { describe, expect, it } from 'vitest';
import { normalizeSpeech } from './style-normalizer.js';

describe('style normalizer', () => {
  it('bounds sentences and removes forbidden phrases', () => {
    const result = normalizeSpeech('Sure thing. I am certain. Extra detail. More detail.', { maxSentences: 2, forbiddenPhrases: ['sure thing'] });
    expect(result).toBe('I am certain. Extra detail.');
  });

  it('bounds character length', () => {
    expect(normalizeSpeech('abcdefghij', { maxCharacters: 5 })).toBe('abcd…');
  });

  it('does not speak sensitive details by default', () => {
    expect(normalizeSpeech('The private message says your password is wrong.', { speakSafe: true })).toBe('I have an update that needs your attention.');
  });
});
