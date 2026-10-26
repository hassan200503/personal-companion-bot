/**
 * Conversation engine contracts
 *
 * Defines the conversation state, engine interface, and error types for
 * multi-turn chat orchestration over the provider router.
 */

import type { ChatMessage } from '../providers/contracts.js';
import type { ProviderRouter } from '../providers/router.js';

export type ConversationRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
  providerId?: string;
  model?: string;
  status: 'completed' | 'failed' | 'drafted';
}

export interface Conversation {
  id: string;
  title?: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationStore {
  loadAll(): Conversation[];
  saveConversation(conversation: Conversation): void;
  deleteConversation(id: string): void;
}

export interface ConversationEngineOptions {
  router: ProviderRouter;
  systemPrompt?: string;
  defaultModel?: string;
  maxHistoryMessages?: number;
  maxOutputTokens?: number;
  temperature?: number;
  idFactory?: () => string;
  now?: () => Date;
  memoryRetriever?: (query: string) => Promise<string[]>;
  memoryRecorder?: (user: string, assistant: string) => Promise<void>;
  conversationStore?: ConversationStore;
}

export class ConversationError extends Error {
  constructor(
    public readonly code: 'not_found' | 'degraded' | 'provider_failed' | 'aborted',
    message: string
  ) {
    super(message);
    this.name = 'ConversationError';
  }
}

export interface ConversationEngine {
  createConversation(title?: string): Conversation;
  getConversation(id: string): Conversation | undefined;
  listConversations(): Conversation[];
  deleteConversation(id: string): boolean;
  sendMessage(
    conversationId: string,
    userContent: string,
    signal: AbortSignal
  ): Promise<ConversationMessage>;
  streamMessage(
    conversationId: string,
    userContent: string,
    signal: AbortSignal
  ): AsyncIterable<string>;
  isDegraded(): boolean;
  setDefaultModel(model: string): void;
  resetDegraded(): void;
  setMemoryHooks(hooks: {
    retrieve?: (query: string) => Promise<string[]>;
    record?: (user: string, assistant: string) => Promise<void>;
  }): void;
}

export type { ChatMessage };
