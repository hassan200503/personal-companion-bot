import type { MemoryRepository } from './contracts.js';

export function createMemoryRetriever(
  repo: MemoryRepository,
  options: { limit?: number; excludeSensitivity?: string[] } = {}
): (query: string) => Promise<string[]> {
  const limit = options.limit ?? 8;
  const exclude = new Set(options.excludeSensitivity ?? ['secret']);
  return async (query: string) => {
    let memories = repo.search(query, limit * 2);
    memories = memories.filter((m) => !exclude.has(m.sensitivity));
    return memories.slice(0, limit).map((m) => m.content);
  };
}