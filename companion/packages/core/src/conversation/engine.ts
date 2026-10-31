/**
 * Default conversation engine
 *
 * Orchestrates multi-turn chat over a ProviderRouter, managing history,
 * memory hooks, and degraded-mode tracking.
 */

import { randomUUID } from 'node:crypto';
import type { ChatMessage, ChatCompletionResponse } from '../providers/contracts.js';
import type { ProviderRouter } from '../providers/router.js';
import type {
  Conversation,
  ConversationEngine,
  ConversationEngineOptions,
  ConversationMessage,
  ConversationStore,
} from './contracts.js';
import { ConversationError } from './contracts.js';
import { DecisionOrchestrator, type DecisionSource } from '../cognition/decision-orchestrator.js';
import { buildContextPacket } from '../cognition/prompt-compiler.js';
import { ResponseCache } from './response-cache.js';

export { ConversationError } from './contracts.js';

const DEFAULT_MAX_HISTORY = 20;

export class DefaultConversationEngine implements ConversationEngine {
  private readonly router: ProviderRouter;
  private systemPrompt?: string;
  private defaultModel: string;
  private readonly maxHistoryMessages: number;
  private readonly maxOutputTokens?: number;
  private readonly temperature?: number;
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  private readonly conversationStore?: ConversationStore;
  private conversations = new Map<string, Conversation>();
  private conversationLocks = new Map<string, Promise<void>>();
  private degraded = false;
  private memoryRetriever?: (query: string) => Promise<string[]>;
  private memoryRecorder?: (user: string, assistant: string) => Promise<void>;
  private readonly cognition?: ConversationEngineOptions['cognition'];
  private readonly responseCache: ResponseCache;

  constructor(options: ConversationEngineOptions) {
    this.router = options.router;
    this.systemPrompt = options.systemPrompt;
    this.defaultModel = options.defaultModel ?? '';
    this.maxHistoryMessages = options.maxHistoryMessages ?? DEFAULT_MAX_HISTORY;
    this.maxOutputTokens = options.maxOutputTokens;
    this.temperature = options.temperature;
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.now = options.now ?? (() => new Date());
    this.memoryRetriever = options.memoryRetriever;
    this.memoryRecorder = options.memoryRecorder;
    this.cognition = options.cognition;
    this.conversationStore = options.conversationStore;
    this.responseCache = new ResponseCache(100, 5 * 60 * 1000); // 100 entries, 5 min TTL
    if (this.conversationStore) {
      for (const c of this.conversationStore.loadAll()) {
        this.conversations.set(c.id, c);
      }
    }
  }

  createConversation(title?: string): Conversation {
    const now = this.now().toISOString();
    const conv: Conversation = {
      id: this.idFactory(),
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    if (this.systemPrompt) {
      conv.messages.push({
        id: this.idFactory(),
        role: 'system',
        content: this.systemPrompt,
        createdAt: now,
        status: 'completed',
      });
    }
    this.conversations.set(conv.id, conv);
    this.conversationStore?.saveConversation(conv);
    return conv;
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  deleteConversation(id: string): boolean {
    const ok = this.conversations.delete(id);
    if (ok) this.conversationStore?.deleteConversation(id);
    return ok;
  }

  setDefaultModel(model: string): void {
    if (model) this.defaultModel = model;
  }

  resolveModel(): string {
    if (this.defaultModel) return this.defaultModel;
    const first = this.router.getProviders()[0];
    return first?.model ?? '';
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  isDegraded(): boolean {
    return this.degraded;
  }
  async sendMessage(
    conversationId: string,
    userContent: string,
    signal: AbortSignal
  ): Promise<ConversationMessage> {
    const release = await this.acquireConversation(conversationId);
    try {
      return await this.sendMessageUnlocked(conversationId, userContent, signal);
    } finally {
      release();
    }
  }

  private async sendMessageUnlocked(
    conversationId: string,
    userContent: string,
    signal: AbortSignal
  ): Promise<ConversationMessage> {
    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new ConversationError('not_found', `Conversation ${conversationId} not found`);
    }

    const systemPrompt = this.systemPrompt;
    const model = this.resolveModel();
    const now = this.now().toISOString();
    const userMsg: ConversationMessage = {
      id: this.idFactory(),
      role: 'user',
      content: userContent,
      createdAt: now,
      status: 'completed',
    };
    conv.messages.push(userMsg);
    conv.updatedAt = now;
    this.persistMessage(conv, userMsg);

    let memorySnippets: string[] = [];
    if (this.memoryRetriever) {
      try {
        memorySnippets = await this.memoryRetriever(userContent);
      } catch {
        memorySnippets = [];
      }
    }

    const messages = this.buildMessages(conv, memorySnippets, systemPrompt);

    // Check cache for common queries
    const cachedResponse = this.responseCache.get(userContent, systemPrompt);
    if (cachedResponse) {
      const assistantMsg: ConversationMessage = {
        id: this.idFactory(),
        role: 'assistant',
        content: cachedResponse,
        createdAt: this.now().toISOString(),
        model: model,
        providerId: 'cache',
        status: 'completed',
      };
      conv.messages.push(assistantMsg);
      conv.updatedAt = assistantMsg.createdAt;
      this.persistMessage(conv, assistantMsg);
      return assistantMsg;
    }

    let response: ChatCompletionResponse;
    try {
      if (this.cognition) {
        try {
          const result = await this.decide(messages, memorySnippets, signal, systemPrompt, model);
          response = { model: result.model, content: result.content, finishReason: 'stop', metadata: { providerId: result.providerId } };
        } catch {
          // Fall back to a direct completion so the owner always gets a reply
          // even when the provider cannot satisfy the typed cognition contract.
          response = await this.router.complete(
            { model, messages, maxTokens: this.maxOutputTokens, temperature: this.temperature },
            signal
          );
        }
      } else {
        response = await this.router.complete(
          { model, messages, maxTokens: this.maxOutputTokens, temperature: this.temperature },
          signal
        );
      }
    } catch (error) {
      this.degraded = true;
      if (signal.aborted) {
        throw new ConversationError('aborted', 'Request aborted');
      }
      const code =
        error instanceof Error && (error as { code?: string }).code === 'provider_down'
          ? 'degraded'
          : 'provider_failed';
      throw new ConversationError(
        code as 'degraded' | 'provider_failed',
        error instanceof Error ? error.message : String(error)
      );
    }

    // Cache the response for future use
    this.responseCache.set(userContent, response.content, systemPrompt);

    this.degraded = false;

    const assistantMsg: ConversationMessage = {
      id: this.idFactory(),
      role: 'assistant',
      content: response.content,
      createdAt: this.now().toISOString(),
      model: response.model,
      providerId: response.metadata?.providerId as string | undefined,
      status: 'completed',
    };
    conv.messages.push(assistantMsg);
    conv.updatedAt = assistantMsg.createdAt;
    this.persistMessage(conv, assistantMsg);

    if (this.memoryRecorder) {
      void this.memoryRecorder(userContent, response.content).catch(() => {
        /* ignore */
      });
    }

    return assistantMsg;
  }

  async *streamMessage(
    conversationId: string,
    userContent: string,
    signal: AbortSignal
  ): AsyncIterable<string> {
    const release = await this.acquireConversation(conversationId);
    try {
      yield* this.streamMessageUnlocked(conversationId, userContent, signal);
    } finally {
      release();
    }
  }

  private async *streamMessageUnlocked(
    conversationId: string,
    userContent: string,
    signal: AbortSignal
  ): AsyncIterable<string> {
    if (this.cognition) {
      const reply = await this.sendMessageUnlocked(conversationId, userContent, signal);
      yield reply.content;
      return;
    }
    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new ConversationError('not_found', `Conversation ${conversationId} not found`);
    }

    const systemPrompt = this.systemPrompt;
    const model = this.resolveModel();
    const now = this.now().toISOString();
    const userMsg: ConversationMessage = {
      id: this.idFactory(),
      role: 'user',
      content: userContent,
      createdAt: now,
      status: 'completed',
    };
    conv.messages.push(userMsg);
    conv.updatedAt = now;
    this.persistMessage(conv, userMsg);

    let memorySnippets: string[] = [];
    if (this.memoryRetriever) {
      try {
        memorySnippets = await this.memoryRetriever(userContent);
      } catch {
        memorySnippets = [];
      }
    }

    const messages = this.buildMessages(conv, memorySnippets, systemPrompt);

    let accumulated = '';
    try {
      const stream = this.router.stream(
        {
          model,
          messages,
          maxTokens: this.maxOutputTokens,
          temperature: this.temperature,
        },
        signal
      );
      for await (const chunk of stream) {
        accumulated += chunk.delta;
        yield chunk.delta;
      }
    } catch (error) {
      this.degraded = true;
      if (signal.aborted) {
        throw new ConversationError('aborted', 'Request aborted');
      }
      const code =
        error instanceof Error && (error as { code?: string }).code === 'provider_down'
          ? 'degraded'
          : 'provider_failed';
      throw new ConversationError(
        code as 'degraded' | 'provider_failed',
        error instanceof Error ? error.message : String(error)
      );
    }

    this.degraded = false;

    const assistantMsg: ConversationMessage = {
      id: this.idFactory(),
      role: 'assistant',
      content: accumulated,
      createdAt: this.now().toISOString(),
      model: model || undefined,
      status: 'completed',
    };
    conv.messages.push(assistantMsg);
    conv.updatedAt = assistantMsg.createdAt;
    this.persistMessage(conv, assistantMsg);

    if (this.memoryRecorder) {
      void this.memoryRecorder(userContent, accumulated).catch(() => {
        /* ignore */
      });
    }
  }

  private persistMessage(conv: Conversation, message: ConversationMessage): void {
    if (!this.conversationStore) return;
    if (this.conversationStore.appendMessage) {
      this.conversationStore.appendMessage(conv, message);
      return;
    }
    this.conversationStore.saveConversation(conv);
  }

  private async acquireConversation(conversationId: string): Promise<() => void> {
    const previous = this.conversationLocks.get(conversationId) ?? Promise.resolve();
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const tail = previous.then(() => gate, () => gate);
    this.conversationLocks.set(conversationId, tail);
    await previous.catch(() => undefined);
    return () => {
      releaseGate();
      if (this.conversationLocks.get(conversationId) === tail) {
        this.conversationLocks.delete(conversationId);
      }
    };
  }

  private buildMessages(conv: Conversation, memorySnippets: string[], systemPrompt: string | undefined): ChatMessage[] {
    const msgs: ChatMessage[] = [];

    let systemContent = systemPrompt ?? '';
    if (memorySnippets.length > 0) {
      const mem = memorySnippets.map((s) => `- ${s}`).join('\n');
      systemContent = systemContent
        ? `${systemContent}\n\nRelevant memory:\n${mem}`
        : `Relevant memory:\n${mem}`;
    }
    if (systemContent) {
      msgs.push({ role: 'system', content: systemContent });
    }

    const history = conv.messages.filter((m) => m.role !== 'system');
    const trimmed = history.slice(-this.maxHistoryMessages);
    for (const m of trimmed) {
      if (m.role === 'user' || m.role === 'assistant') {
        msgs.push({ role: m.role, content: m.content });
      }
    }

    return msgs;
  }

  private async decide(
    messages: ChatMessage[],
    memorySnippets: string[],
    signal: AbortSignal,
    systemPrompt: string | undefined,
    model: string
  ): Promise<{ content: string; model: string; providerId: string }> {
    const sources: DecisionSource[] = this.router.getProviders().map((registration) => ({
      id: registration.provider.id,
      complete: async (prompt, sourceSignal) => {
        const result = await registration.provider.complete({
          model: registration.model ?? model,
          messages: [{ role: 'system', content: prompt }],
          maxTokens: this.maxOutputTokens,
          temperature: this.temperature,
          jsonMode: true,
        }, sourceSignal);
        return result.content;
      },
    }));
    const packet = buildContextPacket({
      self: {
        identity: this.cognition!.self.identity,
        style: this.cognition!.self.style,
        policy: `${this.cognition!.self.policy}\n${systemPrompt ?? ''}`,
      },
      ownerModel: this.cognition!.ownerModel,
      situation: this.cognition!.situation?.() ?? '',
      memories: memorySnippets,
      recentTurns: messages,
      toolSchemas: this.cognition!.toolSchemas,
      outputContract: 'Return a valid TurnDecision JSON object. Plans are proposals only; the host validates and executes tools.',
    });
    const result = await new DecisionOrchestrator(sources).decide(packet, signal);
    const provider = this.router.getProvider(result.providerId);
    const modelName = this.router.getProviders().find((item) => item.provider.id === result.providerId)?.model
      ?? model
      ?? provider?.id
      ?? 'unknown';
    return { content: result.decision.speech.text, model: modelName, providerId: result.providerId };
  }

  resetDegraded(): void {
    this.degraded = false;
  }

  setMemoryHooks(hooks: {
    retrieve?: (query: string) => Promise<string[]>;
    record?: (user: string, assistant: string) => Promise<void>;
  }): void {
    if (hooks.retrieve) this.memoryRetriever = hooks.retrieve;
    if (hooks.record) this.memoryRecorder = hooks.record;
  }
}

