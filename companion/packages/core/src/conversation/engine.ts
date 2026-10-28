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
  private degraded = false;
  private memoryRetriever?: (query: string) => Promise<string[]>;
  private memoryRecorder?: (user: string, assistant: string) => Promise<void>;

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
    this.conversationStore = options.conversationStore;
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
    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new ConversationError('not_found', `Conversation ${conversationId} not found`);
    }

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
    this.conversationStore?.saveConversation(conv);

    let memorySnippets: string[] = [];
    if (this.memoryRetriever) {
      try {
        memorySnippets = await this.memoryRetriever(userContent);
      } catch {
        memorySnippets = [];
      }
    }

    const messages = this.buildMessages(conv, memorySnippets);

    let response: ChatCompletionResponse;
    try {
      response = await this.router.complete(
        {
          model: this.defaultModel,
          messages,
          maxTokens: this.maxOutputTokens,
          temperature: this.temperature,
        },
        signal
      );
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
      content: response.content,
      createdAt: this.now().toISOString(),
      model: response.model,
      status: 'completed',
    };
    conv.messages.push(assistantMsg);
    conv.updatedAt = assistantMsg.createdAt;
    this.conversationStore?.saveConversation(conv);

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
    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new ConversationError('not_found', `Conversation ${conversationId} not found`);
    }

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
    this.conversationStore?.saveConversation(conv);

    let memorySnippets: string[] = [];
    if (this.memoryRetriever) {
      try {
        memorySnippets = await this.memoryRetriever(userContent);
      } catch {
        memorySnippets = [];
      }
    }

    const messages = this.buildMessages(conv, memorySnippets);

    let accumulated = '';
    try {
      const stream = this.router.stream(
        {
          model: this.defaultModel,
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
      model: this.defaultModel || undefined,
      status: 'completed',
    };
    conv.messages.push(assistantMsg);
    conv.updatedAt = assistantMsg.createdAt;
    this.conversationStore?.saveConversation(conv);

    if (this.memoryRecorder) {
      void this.memoryRecorder(userContent, accumulated).catch(() => {
        /* ignore */
      });
    }
  }

  private buildMessages(conv: Conversation, memorySnippets: string[]): ChatMessage[] {
    const msgs: ChatMessage[] = [];

    let systemContent = this.systemPrompt ?? '';
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

