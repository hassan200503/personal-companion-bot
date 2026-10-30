import { describe, expect, it } from 'vitest';
import {
  pickImportant,
  scoreMessage,
  speakableDigest,
  summarizeMessages,
} from './importance.js';

describe('email importance', () => {
  it('scores unread + keyword + recruiter sender higher', () => {
    const ranked = scoreMessage({
      uid: 1,
      subject: 'Interview next week for Java role',
      from: 'talent@acme-recruit.com',
      snippet: 'We would love to schedule an interview',
      unseen: true,
    });
    expect(ranked.score).toBeGreaterThanOrEqual(5);
    expect(ranked.reasons).toEqual(expect.arrayContaining(['unread', 'keyword:interview', 'keyword:java']));
  });

  it('pickImportant filters below threshold', () => {
    const msgs = [
      { uid: 1, subject: 'Newsletter', from: 'news@example.com', unseen: false, snippet: 'weekly digest' },
      {
        uid: 2,
        subject: 'Offer letter',
        from: 'hr@company.com',
        unseen: true,
        snippet: 'Please review the offer and contract',
      },
    ];
    const important = pickImportant(msgs, { minScore: 5 });
    expect(important.map((m) => m.uid)).toEqual([2]);
  });

  it('summarize and speakable stay honest on empty', () => {
    expect(summarizeMessages([])).toContain('no messages');
    expect(speakableDigest([], { importantOnly: true })).toContain('no high-importance');
  });
});
