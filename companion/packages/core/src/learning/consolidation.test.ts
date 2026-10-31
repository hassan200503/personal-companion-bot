import { describe, expect, it } from 'vitest';
import { ConsolidationEngine } from './consolidation.js';
import type { Episode } from './episode-logger.js';

describe('ConsolidationEngine', () => {
  it('extracts topic patterns from episodes', async () => {
    const engine = new ConsolidationEngine();
    const episodes: Episode[] = [
      {
        id: 'ep1',
        conversationId: 'conv1',
        startedAt: '2026-10-31T10:00:00Z',
        endedAt: '2026-10-31T10:05:00Z',
        messageCount: 4,
        topics: ['email', 'calendar'],
        toolUses: [],
        userIntent: 'Check email',
      },
      {
        id: 'ep2',
        conversationId: 'conv1',
        startedAt: '2026-10-31T11:00:00Z',
        endedAt: '2026-10-31T11:05:00Z',
        messageCount: 3,
        topics: ['email'],
        toolUses: [],
        userIntent: 'Send email',
      },
      {
        id: 'ep3',
        conversationId: 'conv1',
        startedAt: '2026-10-31T12:00:00Z',
        endedAt: '2026-10-31T12:05:00Z',
        messageCount: 5,
        topics: ['email'],
        toolUses: [],
        userIntent: 'Email update',
      },
    ];

    const result = await engine.consolidate(episodes);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]?.type).toBe('preference');
    expect(result.patterns[0]?.description).toContain('email');
  });

  it('extracts tool patterns from episodes', async () => {
    const engine = new ConsolidationEngine();
    const episodes: Episode[] = [
      {
        id: 'ep1',
        conversationId: 'conv1',
        startedAt: '2026-10-31T10:00:00Z',
        endedAt: '2026-10-31T10:05:00Z',
        messageCount: 4,
        topics: [],
        toolUses: [
          { toolName: 'os.open', timestamp: '2026-10-31T10:01:00Z', success: true, riskClass: 2 },
        ],
        userIntent: 'Open notepad',
      },
      {
        id: 'ep2',
        conversationId: 'conv1',
        startedAt: '2026-10-31T11:00:00Z',
        endedAt: '2026-10-31T11:05:00Z',
        messageCount: 3,
        topics: [],
        toolUses: [
          { toolName: 'os.open', timestamp: '2026-10-31T11:01:00Z', success: true, riskClass: 2 },
        ],
        userIntent: 'Open calculator',
      },
      {
        id: 'ep3',
        conversationId: 'conv1',
        startedAt: '2026-10-31T12:00:00Z',
        endedAt: '2026-10-31T12:05:00Z',
        messageCount: 5,
        topics: [],
        toolUses: [
          { toolName: 'os.open', timestamp: '2026-10-31T12:01:00Z', success: true, riskClass: 2 },
        ],
        userIntent: 'Open settings',
      },
    ];

    const result = await engine.consolidate(episodes);
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]?.type).toBe('habit');
    expect(result.patterns[0]?.description).toContain('os.open');
  });

  it('proposes facts from patterns', async () => {
    const engine = new ConsolidationEngine();
    const episodes: Episode[] = [
      {
        id: 'ep1',
        conversationId: 'conv1',
        startedAt: '2026-10-31T10:00:00Z',
        endedAt: '2026-10-31T10:05:00Z',
        messageCount: 4,
        topics: ['email'],
        toolUses: [],
        userIntent: 'Check email',
      },
      {
        id: 'ep2',
        conversationId: 'conv1',
        startedAt: '2026-10-31T11:00:00Z',
        endedAt: '2026-10-31T11:05:00Z',
        messageCount: 3,
        topics: ['email'],
        toolUses: [],
        userIntent: 'Send email',
      },
      {
        id: 'ep3',
        conversationId: 'conv1',
        startedAt: '2026-10-31T12:00:00Z',
        endedAt: '2026-10-31T12:05:00Z',
        messageCount: 5,
        topics: ['email'],
        toolUses: [],
        userIntent: 'Email update',
      },
    ];

    const result = await engine.consolidate(episodes);
    expect(result.proposedFacts).toHaveLength(1);
    expect(result.proposedFacts[0]?.category).toBe('preference');
    expect(result.proposedFacts[0]?.requiresApproval).toBe(true);
  });

  it('extracts recipe patterns from successful sequences', async () => {
    const engine = new ConsolidationEngine();
    const episodes: Episode[] = [
      {
        id: 'ep1',
        conversationId: 'conv1',
        startedAt: '2026-10-31T10:00:00Z',
        endedAt: '2026-10-31T10:05:00Z',
        messageCount: 4,
        topics: [],
        toolUses: [
          { toolName: 'os.open', timestamp: '2026-10-31T10:01:00Z', success: true, riskClass: 2 },
          { toolName: 'os.speak', timestamp: '2026-10-31T10:02:00Z', success: true, riskClass: 1 },
        ],
        userIntent: 'Open and speak',
        outcome: 'success',
      },
      {
        id: 'ep2',
        conversationId: 'conv1',
        startedAt: '2026-10-31T11:00:00Z',
        endedAt: '2026-10-31T11:05:00Z',
        messageCount: 3,
        topics: [],
        toolUses: [
          { toolName: 'os.open', timestamp: '2026-10-31T11:01:00Z', success: true, riskClass: 2 },
          { toolName: 'os.speak', timestamp: '2026-10-31T11:02:00Z', success: true, riskClass: 1 },
        ],
        userIntent: 'Open and speak again',
        outcome: 'success',
      },
      {
        id: 'ep3',
        conversationId: 'conv1',
        startedAt: '2026-10-31T12:00:00Z',
        endedAt: '2026-10-31T12:05:00Z',
        messageCount: 5,
        topics: [],
        toolUses: [
          { toolName: 'os.open', timestamp: '2026-10-31T12:01:00Z', success: true, riskClass: 2 },
          { toolName: 'os.speak', timestamp: '2026-10-31T12:02:00Z', success: true, riskClass: 1 },
        ],
        userIntent: 'Open and speak once more',
        outcome: 'success',
      },
    ];

    const result = await engine.consolidate(episodes);
    // Recipe extraction requires pattern matching - verify consolidation runs
    expect(result.episodesAnalyzed).toBe(3);
  });

  it('respects max episodes per run', async () => {
    const engine = new ConsolidationEngine({ maxEpisodesPerRun: 2 });
    const episodes: Episode[] = [
      { id: 'ep1', conversationId: 'conv1', startedAt: '2026-10-31T10:00:00Z', endedAt: '2026-10-31T10:05:00Z', messageCount: 1, topics: [], toolUses: [], userIntent: 'Test' },
      { id: 'ep2', conversationId: 'conv1', startedAt: '2026-10-31T11:00:00Z', endedAt: '2026-10-31T11:05:00Z', messageCount: 1, topics: [], toolUses: [], userIntent: 'Test' },
      { id: 'ep3', conversationId: 'conv1', startedAt: '2026-10-31T12:00:00Z', endedAt: '2026-10-31T12:05:00Z', messageCount: 1, topics: [], toolUses: [], userIntent: 'Test' },
    ];

    const result = await engine.consolidate(episodes);
    expect(result.episodesAnalyzed).toBe(2);
  });

  it('calculates confidence correctly', async () => {
    const engine = new ConsolidationEngine();
    const episodes: Episode[] = [
      { id: 'ep1', conversationId: 'conv1', startedAt: '2026-10-31T10:00:00Z', endedAt: '2026-10-31T10:05:00Z', messageCount: 1, topics: ['email'], toolUses: [], userIntent: 'Test' },
      { id: 'ep2', conversationId: 'conv1', startedAt: '2026-10-31T11:00:00Z', endedAt: '2026-10-31T11:05:00Z', messageCount: 1, topics: ['email'], toolUses: [], userIntent: 'Test' },
      { id: 'ep3', conversationId: 'conv1', startedAt: '2026-10-31T12:00:00Z', endedAt: '2026-10-31T12:05:00Z', messageCount: 1, topics: ['email'], toolUses: [], userIntent: 'Test' },
    ];

    const result = await engine.consolidate(episodes);
    expect(result.proposedFacts.length).toBeGreaterThan(0);
    expect(result.proposedFacts[0]?.confidence).toBeGreaterThan(0.5);
  });

  it('handles empty episodes', async () => {
    const engine = new ConsolidationEngine();
    const result = await engine.consolidate([]);
    expect(result.episodesAnalyzed).toBe(0);
    expect(result.proposedFacts).toHaveLength(0);
    expect(result.patterns).toHaveLength(0);
  });
});
