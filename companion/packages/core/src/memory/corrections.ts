import { randomUUID } from 'node:crypto';
import type { Memory, MemoryCorrection, MemoryRepository } from './contracts.js';

export function correctMemory(
  repo: MemoryRepository,
  correction: MemoryCorrection,
  options: { idFactory?: () => string; now?: () => Date } = {}
): Memory {
  const idFactory = options.idFactory ?? (() => randomUUID());
  const now = options.now ?? (() => new Date());
  const nowIso = now().toISOString();
  const old = repo.getById(correction.oldMemoryId);
  if (!old) throw new Error(`Memory ${correction.oldMemoryId} not found`);
  const newMem: Memory = {
    id: idFactory(),
    category: correction.newCategory ?? old.category,
    content: correction.newContent,
    payload: old.payload,
    origin: old.origin,
    sourceType: old.sourceType,
    sourceReference: old.sourceReference,
    confidence: old.confidence,
    sensitivity: old.sensitivity,
    approval: old.approval,
    retentionPolicy: old.retentionPolicy,
    supersedesId: undefined,
    createdAt: nowIso,
    lastObservedAt: nowIso,
    lastConfirmedAt: old.lastConfirmedAt,
  };
  repo.insert(newMem);
  repo.markSuperseded(old.id, newMem.id, nowIso);
  repo.recordEvent({ id: idFactory(), memoryId: old.id, type: 'superseded', detail: { replacementId: newMem.id, reason: correction.reason }, createdAt: nowIso });
  repo.recordEvent({ id: idFactory(), memoryId: newMem.id, type: 'corrected', detail: { replaces: old.id, reason: correction.reason }, createdAt: nowIso });
  return newMem;
}