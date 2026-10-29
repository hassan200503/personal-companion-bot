import type { MemoryOrigin, MemorySensitivity } from './contracts.js';

export interface LearningEvidence {
  observations: number;
  spanDays: number;
  explicitOwnerStatement?: boolean;
  thirdPartyContent?: boolean;
}

export interface LearningCandidate {
  category: string;
  content: string;
  origin: MemoryOrigin;
  sensitivity?: MemorySensitivity;
  evidence: LearningEvidence;
}

export interface LearningDecision {
  allowed: boolean;
  reason?: 'needs_more_evidence' | 'sensitive_trait' | 'third_party_content' | 'empty_content' | 'previously_rejected';
  sensitivity: MemorySensitivity;
}

const sensitiveTraitPattern = /\b(health|medical|diagnos|religion|politic|sexual|orientation|race|ethnic|mental health|disability)\b/i;

export function evaluateLearningCandidate(candidate: LearningCandidate, previouslyRejected = false): LearningDecision {
  const content = candidate.content.trim();
  if (!content) return { allowed: false, reason: 'empty_content', sensitivity: 'normal' };
  if (previouslyRejected) return { allowed: false, reason: 'previously_rejected', sensitivity: candidate.sensitivity ?? 'normal' };
  if (candidate.evidence.thirdPartyContent) return { allowed: false, reason: 'third_party_content', sensitivity: 'personal' };
  if (sensitiveTraitPattern.test(`${candidate.category} ${content}`)) return { allowed: false, reason: 'sensitive_trait', sensitivity: 'sensitive' };
  const explicit = candidate.origin === 'explicit' || candidate.evidence.explicitOwnerStatement === true;
  const enoughEvidence = explicit || (candidate.evidence.observations >= 3 && candidate.evidence.spanDays >= 14);
  if (!enoughEvidence) return { allowed: false, reason: 'needs_more_evidence', sensitivity: candidate.sensitivity ?? 'normal' };
  return { allowed: true, sensitivity: candidate.sensitivity ?? 'normal' };
}
