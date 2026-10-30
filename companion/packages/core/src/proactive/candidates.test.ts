import { describe, expect, it } from 'vitest';
import { buildCareerCandidates, buildEmailImportantCandidates, ownerWantsCareerDigest } from './candidates.js';

describe('proactive candidates', () => {
  it('builds a career digest when owner goals mention java/career/role', () => {
    expect(ownerWantsCareerDigest({ goals: ['ship docs'] })).toBe(false);
    expect(buildCareerCandidates({ goals: ['ship docs'] }, 1_700_000_000_000)).toEqual([]);

    const owner = {
      occupation: 'Full-stack Java developer',
      goals: ['career growth', 'finding strong engineering roles'],
    };
    expect(ownerWantsCareerDigest(owner)).toBe(true);
    const candidates = buildCareerCandidates(owner, 1_700_000_000_000);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.topic).toBe('career');
    expect(candidates[0]?.message).toMatch(/Java|engineering|career/i);
  });

  it('builds email candidates only for important items', () => {
    const now = 1_700_000_000_000;
    const candidates = buildEmailImportantCandidates([
      { id: 'a', subject: 'Hello', important: false },
      { id: 'b', subject: 'Offer letter', from: 'recruiter@example.com', important: true, receivedAt: now - 10 },
    ], now);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.topic).toBe('email-important');
    expect(candidates[0]?.message).toContain('Offer letter');
    expect(candidates[0]?.message).toContain('recruiter@example.com');
  });
});
