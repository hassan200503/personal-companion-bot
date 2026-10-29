import { describe, expect, it } from 'vitest';
import { parseTurnDecision } from './contracts.js';

const valid = {
  schemaVersion: '1', turnId: 't-1', intent: { type: 'open', confidence: 0.9 },
  understanding: 'Open Notepad.', plan: [{ step: 'Open app', tool: 'os.open', args: { target: 'notepad' }, expectedPostcondition: 'Notepad window is visible' }],
  speech: { text: 'Opening Notepad.', tone: 'concise' }, memoryCandidates: [],
  riskAssessment: { proposedRiskClass: 1, reasons: ['Opening an application'] }, followUps: []
};

describe('TurnDecision contract', () => {
  it('accepts native and fenced JSON', () => {
    expect(parseTurnDecision(valid).ok).toBe(true);
    expect(parseTurnDecision(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``).ok).toBe(true);
  });

  it('rejects malformed, overlong and out-of-range decisions', () => {
    expect(parseTurnDecision('{bad json').ok).toBe(false);
    expect(parseTurnDecision({ ...valid, intent: { type: 'open', confidence: 2 } }).ok).toBe(false);
    expect(parseTurnDecision({ ...valid, plan: Array.from({ length: 21 }, () => valid.plan[0]) }).ok).toBe(false);
  });
});
