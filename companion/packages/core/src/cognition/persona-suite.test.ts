import { describe, expect, it } from 'vitest';
import { normalizeSpeech } from './style-normalizer.js';

const prompts = [
  'Greet me by name.', 'Open Notepad.', 'Play a song.', 'Send a message.', 'What do you know?',
  'I am not sure.', 'Correct your last answer.', 'Explain the failure.', 'Remind me tomorrow.',
  'Search for a file.', 'Read this result.', 'Change the setting.', 'Delete this note.',
  'Who are you?', 'Can you do anything?', 'What is uncertain?', 'Stop the action.', 'Try again.',
  'Find the contact.', 'Tell me the status.', 'Why did you interrupt?', 'Keep it short.',
  'Help me focus.', 'I changed my mind.', 'Do not guess.', 'Summarize the plan.',
  'What needs approval?', 'Can you access a locked window?', 'Play the local match.', 'Report what happened.'
];

const profiles = [
  (prompt: string) => `Sure thing, owner. ${prompt} I am definitely certain. As an AI, I can do everything.`,
  (prompt: string) => prompt,
  (prompt: string) => `I received the request about ${prompt}. I will verify the result before claiming completion.`,
];

describe('persona regression suite', () => {
  it('replays 30 prompts across three provider quirks with at least 95% rule compliance', () => {
    let passed = 0;
    let total = 0;
    for (const profile of profiles) {
      for (const prompt of prompts) {
        const output = normalizeSpeech(profile(prompt), {
          ownerName: 'Owner',
          maxCharacters: 240,
          maxSentences: 2,
          forbiddenPhrases: ['sure thing', 'as an ai', 'definitely'],
        });
        const sentenceCount = output.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.length ?? 0;
        const compliant = output.length <= 240
          && sentenceCount <= 2
          && !/sure thing|as an ai|definitely/i.test(output)
          && output.length > 0;
        total += 1;
        if (compliant) passed += 1;
      }
    }
    expect(total).toBe(90);
    expect(passed / total).toBeGreaterThanOrEqual(0.95);
  });
});
