import { z } from 'zod';
import type { ToolDefinition } from './contracts.js';

export function createMemorySearchTool(): ToolDefinition<{ query: string; limit?: number }, { results: unknown[] }> {
  return {
    name: 'memory.search',
    version: '1.0.0',
    description: 'Search approved memories by text.',
    inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().positive().max(50).optional() }),
    outputSchema: z.object({ results: z.array(z.unknown()) }),
    requiredPermissions: ['memory.read'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 5000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (ctx, input) => {
      const repo = ctx.memoryRepository;
      if (!repo) throw new Error('memory repository unavailable');
      const results = repo.search(input.query, input.limit ?? 10);
      return { results };
    },
  };
}

export function createMemoryProposeTool(): ToolDefinition<{ category: string; content: string; origin?: 'explicit' | 'inferred' | 'imported' }, { id: string }> {
  return {
    name: 'memory.propose',
    version: '1.0.0',
    description: 'Propose a new memory for owner approval.',
    inputSchema: z.object({
      category: z.string().min(1),
      content: z.string().min(1),
      origin: z.enum(['explicit', 'inferred', 'imported']).optional(),
    }),
    outputSchema: z.object({ id: z.string() }),
    requiredPermissions: ['memory.write'],
    dataClassification: 'personal',
    riskClass: 2,
    reversible: false,
    timeoutMs: 5000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (ctx, input) => {
      const repo = ctx.memoryRepository;
      if (!repo) throw new Error('memory repository unavailable');
      const { randomUUID } = await import('node:crypto');
      const now = ctx.now().toISOString();
      const memory = {
        id: randomUUID(),
        category: input.category,
        content: input.content,
        payload: {},
        origin: input.origin ?? 'explicit',
        confidence: 1,
        sensitivity: 'normal' as const,
        approval: 'proposed' as const,
        retentionPolicy: 'owner-managed',
        createdAt: now,
        lastObservedAt: now,
      };
      repo.insert(memory);
      repo.recordEvent({ id: randomUUID(), memoryId: memory.id, type: 'proposed', createdAt: now });
      return { id: memory.id };
    },
  };
}

export function createDraftCreateTool(): ToolDefinition<{ title: string; content: string }, { id: string }> {
  return {
    name: 'draft.create',
    version: '1.0.0',
    description: 'Create a local draft note.',
    inputSchema: z.object({ title: z.string().min(1), content: z.string() }),
    outputSchema: z.object({ id: z.string() }),
    requiredPermissions: ['drafts.write'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 2000,
    cancellable: false,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (ctx, input) => {
      if (!ctx.draftStore) throw new Error('draft store unavailable');
      const id = ctx.draftStore.create(input.title, input.content);
      return { id };
    },
  };
}

