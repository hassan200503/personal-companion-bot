import { describe, expect, it } from 'vitest';
import { cleanQuestion } from './persona';

describe('cleanQuestion', () => {
  it('keeps a direct question', () => {
    expect(cleanQuestion('What did you work on today?')).toBe('What did you work on today?');
  });

  it('pulls the question out of preamble and list markers', () => {
    expect(cleanQuestion('Sure!\n1. What part of RentManager is slowing you down?')).toBe(
      'What part of RentManager is slowing you down?'
    );
  });

  it('adds a question mark when a provider truncates it', () => {
    expect(cleanQuestion('What would make tomorrow easier')).toBe('What would make tomorrow easier?');
  });

  it('removes surrounding quotes', () => {
    expect(cleanQuestion('"How did the deployment go?"')).toBe('How did the deployment go?');
  });
});
