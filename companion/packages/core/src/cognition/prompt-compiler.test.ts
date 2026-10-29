import { describe, expect, it } from 'vitest';
import { buildContextPacket, renderContextMessages } from './prompt-compiler.js';

const input = {
  self: { identity: 'Companion identity', style: 'Short and honest', policy: 'Never bypass security.' },
  ownerModel: 'Owner prefers concise answers.', situation: 'Active window: Notepad', memories: ['approved: uses dark mode'],
  recentTurns: [{ role: 'user' as const, content: 'Open Notepad' }], toolSchemas: ['os.open(target)'], outputContract: 'Return TurnDecision JSON.'
};

describe('prompt compiler', () => {
  it('builds the same canonical packet independent of provider profile', () => {
    const first = buildContextPacket(input, { streaming: true, maxContextLength: 8_000, functionCalling: true, vision: false, jsonMode: true });
    const second = buildContextPacket(input, { streaming: false, maxContextLength: 32_000, functionCalling: false, vision: true, jsonMode: false });
    expect(first.layers.map((layer) => layer.level)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
    expect(first.canonical).toContain('[L0]');
    expect(second.canonical).toContain('Never bypass security.');
  });

  it('keeps the output contract and renders only the user message separately', () => {
    const packet = buildContextPacket(input);
    const messages = renderContextMessages(packet, 'Please do it');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('Return TurnDecision JSON.');
    expect(messages[1]).toEqual({ role: 'user', content: 'Please do it' });
  });
});
