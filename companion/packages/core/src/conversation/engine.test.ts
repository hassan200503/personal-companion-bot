import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from '../providers/mock-provider.js';
import { ProviderRouter } from '../providers/router.js';
import { ProviderError } from '../providers/contracts.js';
import { DefaultConversationEngine, ConversationError } from './engine.js';

describe('DefaultConversationEngine', () => {
  let router: ProviderRouter;
  let mock: MockProvider;
  let engine: DefaultConversationEngine;

  beforeEach(() => {
    router = new ProviderRouter({ maxRetries: 1 });
    mock = new MockProvider({ responseContent: 'Hello from mock' });
    router.register(mock, 10);
    engine = new DefaultConversationEngine({
      router,
      systemPrompt: 'You are a helpful companion.',
      defaultModel: 'mock-model',
    });
  });

  it('creates and lists conversations', () => {
    const conv = engine.createConversation('Test');
    expect(conv.title).toBe('Test');
    expect(conv.messages.length).toBe(1);
    expect(engine.getConversation(conv.id)).toBeDefined();
    expect(engine.listConversations().length).toBe(1);
  });

  it('deletes a conversation', () => {
    const conv = engine.createConversation();
    expect(engine.deleteConversation(conv.id)).toBe(true);
    expect(engine.getConversation(conv.id)).toBeUndefined();
    expect(engine.deleteConversation('nope')).toBe(false);
  });

  it('sends a message and gets assistant reply', async () => {
    const conv = engine.createConversation();
    const reply = await engine.sendMessage(conv.id, 'Hi', new AbortController().signal);
    expect(reply.role).toBe('assistant');
    expect(reply.content).toBe('Hello from mock');
    const updated = engine.getConversation(conv.id)!;
    expect(updated.messages.filter((m) => m.role === 'user').length).toBe(1);
    expect(updated.messages.filter((m) => m.role === 'assistant').length).toBe(1);
  });

  it('throws not_found for unknown conversation', async () => {
    await expect(
      engine.sendMessage('missing', 'Hi', new AbortController().signal)
    ).rejects.toBeInstanceOf(ConversationError);
  });

  it('tracks degraded mode on provider failure', async () => {
    const failRouter = new ProviderRouter({ maxRetries: 1 });
    const failMock = new MockProvider({
      completeError: new ProviderError('provider_down', 'down', false),
    });
    failRouter.register(failMock, 10);
    const e = new DefaultConversationEngine({ router: failRouter, defaultModel: 'm' });
    const conv = e.createConversation();
    await expect(e.sendMessage(conv.id, 'Hi', new AbortController().signal)).rejects.toBeInstanceOf(
      ConversationError
    );
    expect(e.isDegraded()).toBe(true);
    e.resetDegraded();
    expect(e.isDegraded()).toBe(false);
  });

  it('streams a message and accumulates', async () => {
    const conv = engine.createConversation();
    const ctrl = new AbortController();
    const chunks: string[] = [];
    for await (const c of engine.streamMessage(conv.id, 'Hi', ctrl.signal)) {
      chunks.push(c);
    }
    const full = chunks.join('');
    expect(full).toContain('Hello from mock');
    const updated = engine.getConversation(conv.id)!;
    expect(updated.messages.filter((m) => m.role === 'assistant').length).toBe(1);
  });

  it('trims history to maxHistoryMessages', async () => {
    const e = new DefaultConversationEngine({
      router,
      defaultModel: 'mock-model',
      maxHistoryMessages: 2,
    });
    const conv = e.createConversation();
    for (let i = 0; i < 5; i++) {
      await e.sendMessage(conv.id, `msg ${i}`, new AbortController().signal);
    }
    const calls = mock.getCompleteCalls();
    const last = calls[calls.length - 1]!;
    const userMsgs = last.messages.filter((m) => m.role === 'user');
    expect(userMsgs.length).toBeLessThanOrEqual(2);
  });

  it('memory retriever injects into system prompt', async () => {
    const e = new DefaultConversationEngine({
      router,
      systemPrompt: 'base',
      defaultModel: 'mock-model',
      memoryRetriever: async () => ['fact A'],
    });
    const conv = e.createConversation();
    await e.sendMessage(conv.id, 'Hi', new AbortController().signal);
    const calls = mock.getCompleteCalls();
    const last = calls[calls.length - 1]!;
    const sys = last.messages.find((m) => m.role === 'system');
    expect(sys?.content).toContain('fact A');
  });

  it('memory recorder is called on success', async () => {
    let recorded: { u: string; a: string } | null = null;
    const e = new DefaultConversationEngine({
      router,
      defaultModel: 'mock-model',
      memoryRecorder: async (u, a) => {
        recorded = { u, a };
      },
    });
    const conv = e.createConversation();
    await e.sendMessage(conv.id, 'Hi there', new AbortController().signal);
    await new Promise((r) => setTimeout(r, 10));
    expect(recorded).not.toBeNull();
    expect(recorded!.u).toBe('Hi there');
  });

  it('setMemoryHooks updates hooks', async () => {
    const e = new DefaultConversationEngine({ router, defaultModel: 'mock-model' });
    const conv = e.createConversation();
    let called = false;
    e.setMemoryHooks({ retrieve: async () => { called = true; return []; } });
    await e.sendMessage(conv.id, 'Hi', new AbortController().signal);
    expect(called).toBe(true);
  });

  it('uses the typed cognition contract when configured', async () => {
    const typed = JSON.stringify({ schemaVersion: '1', turnId: 't1', intent: { type: 'none', confidence: 1 }, understanding: 'A greeting.', plan: [], speech: { text: 'Typed reply.', tone: 'plain' }, memoryCandidates: [], riskAssessment: { proposedRiskClass: 1, reasons: [] }, followUps: [] });
    const typedProvider = new MockProvider({ responseContent: typed });
    const typedRouter = new ProviderRouter({ maxRetries: 1 });
    typedRouter.register(typedProvider, 10, 'typed-model');
    const e = new DefaultConversationEngine({
      router: typedRouter,
      defaultModel: 'fallback-model',
      cognition: { self: { identity: 'Companion', style: 'concise', policy: 'Never execute model plans directly.' } },
    });
    const conv = e.createConversation();
    const reply = await e.sendMessage(conv.id, 'Hello', new AbortController().signal);
    expect(reply.content).toBe('Typed reply.');
    expect(reply.providerId).toBe('mock-provider');
    expect(typedProvider.getCompleteCalls()[0]?.jsonMode).toBe(true);
  });

  it('serializes concurrent turns for the same conversation', async () => {
    mock.setConfig({ latency: 10 });
    const conv = engine.createConversation();
    await Promise.all([
      engine.sendMessage(conv.id, 'A', new AbortController().signal),
      engine.sendMessage(conv.id, 'B', new AbortController().signal),
    ]);
    const calls = mock.getCompleteCalls();
    expect(calls).toHaveLength(2);
    const first = calls[0]!.messages;
    expect(first.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['A']);
    expect(first.some((m) => m.role === 'assistant')).toBe(false);
    const second = calls[1]!.messages;
    expect(second.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['A', 'B']);
    expect(second.some((m) => m.role === 'assistant' && m.content === 'Hello from mock')).toBe(true);
    const roles = engine.getConversation(conv.id)!.messages.map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user', 'assistant']);
  });

  it('snapshots the system prompt at the start of a turn', async () => {
    const e = new DefaultConversationEngine({
      router,
      systemPrompt: 'VOICE',
      defaultModel: 'mock-model',
      memoryRetriever: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return [];
      },
    });
    const conv = e.createConversation();
    const pending = e.sendMessage(conv.id, 'Hi', new AbortController().signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    e.setSystemPrompt('TEXT');
    await pending;
    const system = mock.getCompleteCalls().at(-1)?.messages.find((m) => m.role === 'system');
    expect(system?.content).toContain('VOICE');
    expect(system?.content).not.toContain('TEXT');
  });

});
