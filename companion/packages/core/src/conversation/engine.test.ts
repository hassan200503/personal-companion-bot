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

});
