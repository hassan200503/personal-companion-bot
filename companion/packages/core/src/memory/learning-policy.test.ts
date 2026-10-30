import { describe, expect, it } from 'vitest';
import { evaluateLearningCandidate, isFastInferredCategory } from './learning-policy.js';

const base = { category: 'preference', content: 'prefers concise answers', origin: 'inferred' as const, evidence: { observations: 3, spanDays: 14 } };

describe('learning policy', () => {
  it('requires evidence for inferred candidates but accepts explicit owner statements', () => {
    expect(evaluateLearningCandidate({ ...base, category: 'habit', evidence: { observations: 2, spanDays: 13 } }).reason).toBe('needs_more_evidence');
    expect(evaluateLearningCandidate({ ...base, category: 'habit', evidence: { observations: 3, spanDays: 13 } }).reason).toBe('needs_more_evidence');
    expect(evaluateLearningCandidate({ ...base, category: 'habit', evidence: { observations: 3, spanDays: 14 } }).allowed).toBe(true);
    expect(evaluateLearningCandidate({ ...base, origin: 'explicit', evidence: { observations: 1, spanDays: 0, explicitOwnerStatement: true } }).allowed).toBe(true);
  });

  it('allows same-day inferred style/tone/vocabulary/topic/interest/preference with 3+ observations', () => {
    for (const category of ['style', 'Tone', 'VOCABULARY', 'topic preference', 'interest', 'Preference']) {
      expect(isFastInferredCategory(category)).toBe(true);
      expect(evaluateLearningCandidate({
        ...base,
        category,
        evidence: { observations: 3, spanDays: 0 },
      }).allowed).toBe(true);
      expect(evaluateLearningCandidate({
        ...base,
        category,
        evidence: { observations: 2, spanDays: 0 },
      }).reason).toBe('needs_more_evidence');
    }
  });

  it('rejects sensitive traits and third-party message content', () => {
    expect(evaluateLearningCandidate({ ...base, category: 'health', content: 'has a diagnosis' }).reason).toBe('sensitive_trait');
    expect(evaluateLearningCandidate({ ...base, evidence: { ...base.evidence, thirdPartyContent: true } }).reason).toBe('third_party_content');
  });

  it('does not repeat a rejected proposal', () => {
    expect(evaluateLearningCandidate(base, true).reason).toBe('previously_rejected');
  });
});
