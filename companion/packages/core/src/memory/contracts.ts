/**
 * Memory pipeline contracts
 *
 * Defines memory records, events, repository, retrieval, correction,
 * timeline, and approval inbox abstractions.
 */

export type MemoryOrigin = 'explicit' | 'inferred' | 'imported';
export type MemoryApproval = 'proposed' | 'approved' | 'rejected';
export type MemorySensitivity = 'normal' | 'personal' | 'sensitive' | 'secret';

export interface Memory {
  id: string;
  category: string;
  content: string;
  payload: Record<string, unknown>;
  origin: MemoryOrigin;
  sourceType?: string;
  sourceReference?: string;
  confidence: number;
  sensitivity: MemorySensitivity;
  approval: MemoryApproval;
  retentionPolicy: string;
  expiresAt?: string;
  supersedesId?: string;
  deletedAt?: string;
  createdAt: string;
  lastObservedAt: string;
  lastConfirmedAt?: string;
}

export type MemoryEventType =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'corrected'
  | 'deleted'
  | 'observed'
  | 'superseded';

export interface MemoryEvent {
  id: string;
  memoryId: string;
  type: MemoryEventType;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export interface MemoryFilter {
  approval?: MemoryApproval;
  category?: string;
  includeDeleted?: boolean;
  sensitivityMax?: MemorySensitivity;
}

export interface MemoryRepository {
  insert(memory: Memory): void;
  getById(id: string): Memory | null;
  list(filter?: MemoryFilter): Memory[];
  search(query: string, limit?: number): Memory[];
  updateApproval(id: string, approval: MemoryApproval, now: string): void;
  softDelete(id: string, now: string): void;
  markSuperseded(oldId: string, newId: string, now: string): void;
  recordEvent(event: MemoryEvent): void;
  eventsFor(memoryId: string): MemoryEvent[];
  listProposed(): Memory[];
}

export interface MemoryRetrieverOptions {
  limit?: number;
  excludeSensitivity?: MemorySensitivity[];
}

export interface MemoryCorrection {
  oldMemoryId: string;
  newContent: string;
  newCategory?: string;
  reason?: string;
}