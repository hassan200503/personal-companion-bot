import { describe, expect, it } from 'vitest';
import { composeGreeting } from './greeting.js';

describe('composeGreeting', () => {
  const morning = new Date('2026-10-29T08:15:00');

  it('greets by name offline and stays within two sentences', () => {
    const greeting = composeGreeting({ ownerName: 'Amina', now: morning });
    expect(greeting.text).toContain('Amina');
    expect(greeting.text.split(/[.!?]+/).filter(Boolean)).toHaveLength(2);
    expect(greeting.shouldSpeak).toBe(true);
  });

  it('varies when the previous greeting was used', () => {
    const first = composeGreeting({ ownerName: 'Amina', now: morning });
    const second = composeGreeting({ ownerName: 'Amina', now: morning, recentGreetings: [first.text] });
    expect(second.text).not.toBe(first.text);
  });

  it('returns pronunciation markup without changing visible text', () => {
    const greeting = composeGreeting({ ownerName: 'Amina', pronunciation: 'aːmiːna', now: morning });
    expect(greeting.text).toContain('Amina');
    expect(greeting.ssml).toContain('<phoneme');
    expect(greeting.ssml).toContain('aːmiːna');
  });

  it('does not speak while muted or during overnight quiet hours', () => {
    expect(composeGreeting({ ownerName: 'Amina', now: morning, muted: true }).shouldSpeak).toBe(false);
    expect(composeGreeting({ ownerName: 'Amina', now: morning, quietHours: { start: '22:00', end: '09:00' } }).shouldSpeak).toBe(false);
  });
});
