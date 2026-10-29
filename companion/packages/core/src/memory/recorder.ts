import { randomUUID } from 'node:crypto';
import type { Memory, MemoryRepository } from './contracts.js';

export interface RecordMemoryInput {
  category: string;
  content: string;
  origin?: Memory['origin'];
  sourceType?: string;
  sourceReference?: string;
  confidence?: number;
  sensitivity?: Memory['sensitivity'];
  payload?: Record<string, unknown>;
}

export function createMemoryRecorder(
  repo: MemoryRepository,
  options: { idFactory?: () => string; now?: () => Date; recordConversation?: boolean } = {}
): (input: RecordMemoryInput | string, assistant?: string) => Promise<void> {
  const idFactory = options.idFactory ?? (() => randomUUID());
  const now = options.now ?? (() => new Date());
  return async (input, assistant) => {
    if (typeof input === 'string' && options.recordConversation === false) return;
    const nowIso = now().toISOString();
    const content = typeof input === 'string' ? (assistant ? `${input}\n${assistant}` : input) : input.content;
    // For conversation recorder usage: store a proposed memory of the exchange
    const mem: Memory = {
      id: idFactory(),
      category: typeof input === 'string' ? 'conversation' : input.category,
      content,
      payload: typeof input === 'string' ? { user: input, assistant } : (input.payload ?? {}),
      origin: typeof input === 'string' ? 'inferred' : (input.origin ?? 'inferred'),
      sourceType: typeof input === 'string' ? 'conversation' : input.sourceType,
      sourceReference: typeof input === 'string' ? undefined : input.sourceReference,
      confidence: typeof input === 'string' ? 0.5 : (input.confidence ?? 0.5),
      sensitivity: typeof input === 'string' ? 'normal' : (input.sensitivity ?? 'normal'),
      approval: 'proposed',
      retentionPolicy: 'owner-managed',
      createdAt: nowIso,
      lastObservedAt: nowIso,
    };
    repo.insert(mem);
    repo.recordEvent({ id: idFactory(), memoryId: mem.id, type: 'proposed', createdAt: nowIso });
  };
}
