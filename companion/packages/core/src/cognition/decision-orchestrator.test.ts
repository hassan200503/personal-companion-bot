import { describe, expect, it } from 'vitest';
import { DecisionOrchestrator } from './decision-orchestrator.js';
import { buildContextPacket } from './prompt-compiler.js';

const decision = JSON.stringify({ schemaVersion: '1', turnId: '1', intent: { type: 'none', confidence: 1 }, understanding: 'No action.', plan: [], speech: { text: 'Okay.', tone: 'plain' }, memoryCandidates: [], riskAssessment: { proposedRiskClass: 1, reasons: [] }, followUps: [] });
const packet = buildContextPacket({ self: { identity: 'id', style: 'style', policy: 'policy' }, outputContract: 'json' });

describe('DecisionOrchestrator', () => {
  it('repairs once before accepting a decision', async () => {
    const calls: string[] = [];
    const result = await new DecisionOrchestrator([{ id: 'one', complete: async (prompt) => { calls.push(prompt); return calls.length === 1 ? '{}' : decision; } }]).decide(packet, new AbortController().signal);
    expect(result.providerId).toBe('one');
    expect(result.repaired).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('fails over after one failed repair', async () => {
    const result = await new DecisionOrchestrator([
      { id: 'bad', complete: async () => '{}' },
      { id: 'good', complete: async () => decision }
    ]).decide(packet, new AbortController().signal);
    expect(result.providerId).toBe('good');
    expect(result.repaired).toBe(false);
  });

  it('fails over when a provider throws during completion', async () => {
    const result = await new DecisionOrchestrator([
      { id: 'down', complete: async () => { throw new Error('network'); } },
      { id: 'healthy', complete: async () => decision }
    ]).decide(packet, new AbortController().signal);
    expect(result.providerId).toBe('healthy');
  });
});
