import { randomUUID } from 'node:crypto';
import type { Memory, MemoryRepository } from './contracts.js';

export function listApprovalInbox(repo: MemoryRepository): Memory[] {
  return repo.listProposed();
}

/** Prevents the consolidation job from re-proposing an item the owner rejected. */
export function wasMemoryRejected(repo: MemoryRepository, category: string, content: string): boolean {
  const normalizedCategory = category.trim().toLocaleLowerCase();
  const normalizedContent = content.trim().toLocaleLowerCase();
  return repo
    .list({ approval: 'rejected', includeDeleted: true })
    .some((memory) => memory.category.trim().toLocaleLowerCase() === normalizedCategory
      && memory.content.trim().toLocaleLowerCase() === normalizedContent);
}

export function approveMemory(repo: MemoryRepository, id: string, now: () => Date = () => new Date()): void {
  const nowIso = now().toISOString();
  repo.updateApproval(id, 'approved', nowIso);
  repo.recordEvent({ id: randomUUID(), memoryId: id, type: 'approved', createdAt: nowIso });
}

export function rejectMemory(repo: MemoryRepository, id: string, now: () => Date = () => new Date()): void {
  const nowIso = now().toISOString();
  repo.updateApproval(id, 'rejected', nowIso);
  repo.recordEvent({ id: randomUUID(), memoryId: id, type: 'rejected', createdAt: nowIso });
}

export function getMemoryTimeline(repo: MemoryRepository, memoryId: string) {
  return repo.eventsFor(memoryId);
}
