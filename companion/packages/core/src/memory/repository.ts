import type { SqliteConnection } from '../storage/types.js';
import type { Memory, MemoryEvent, MemoryFilter, MemoryRepository } from './contracts.js';

interface MemoryRow {
  id: string;
  category: string;
  content: string;
  payload_json: string | null;
  origin: string;
  source_type: string | null;
  source_reference: string | null;
  confidence: number;
  sensitivity: string;
  approval: string;
  retention_policy: string;
  expires_at: string | null;
  supersedes_id: string | null;
  deleted_at: string | null;
  created_at: string;
  last_observed_at: string;
  last_confirmed_at: string | null;
}

function rowToMemory(row: unknown): Memory {
  const r = row as MemoryRow;
  return {
    id: r.id,
    category: r.category as Memory['category'],
    content: r.content,
    payload: JSON.parse(r.payload_json || '{}'),
    origin: r.origin as Memory['origin'],
    sourceType: r.source_type ?? undefined,
    sourceReference: r.source_reference ?? undefined,
    confidence: r.confidence,
    sensitivity: r.sensitivity as Memory['sensitivity'],
    approval: r.approval as Memory['approval'],
    retentionPolicy: r.retention_policy as Memory['retentionPolicy'],
    expiresAt: r.expires_at ?? undefined,
    supersedesId: r.supersedes_id ?? undefined,
    deletedAt: r.deleted_at ?? undefined,
    createdAt: r.created_at,
    lastObservedAt: r.last_observed_at,
    lastConfirmedAt: r.last_confirmed_at ?? undefined,
  };
}

interface MemoryEventRow {
  id: string;
  memory_id: string;
  type: string;
  detail_json: string | null;
  created_at: string;
}

function rowToEvent(row: unknown): MemoryEvent {
  const r = row as MemoryEventRow;
  return {
    id: r.id,
    memoryId: r.memory_id,
    type: r.type as MemoryEvent['type'],
    detail: JSON.parse(r.detail_json || '{}'),
    createdAt: r.created_at,
  };
}

const SENSITIVITY_ORDER: Record<string, number> = {
  normal: 0,
  personal: 1,
  sensitive: 2,
  secret: 3,
};

export class SqliteMemoryRepository implements MemoryRepository {
  constructor(private readonly db: SqliteConnection) {}

  insert(memory: Memory): void {
    this.db
      .prepare(
        `INSERT INTO memories (id, category, content, payload_json, origin, source_type, source_reference, confidence, sensitivity, approval, retention_policy, expires_at, supersedes_id, deleted_at, created_at, last_observed_at, last_confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        memory.id,
        memory.category,
        memory.content,
        JSON.stringify(memory.payload ?? {}),
        memory.origin,
        memory.sourceType ?? null,
        memory.sourceReference ?? null,
        memory.confidence,
        memory.sensitivity,
        memory.approval,
        memory.retentionPolicy,
        memory.expiresAt ?? null,
        memory.supersedesId ?? null,
        memory.deletedAt ?? null,
        memory.createdAt,
        memory.lastObservedAt,
        memory.lastConfirmedAt ?? null
      );
  }

  getById(id: string): Memory | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
    return row ? rowToMemory(row) : null;
  }

  list(filter?: MemoryFilter): Memory[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (!filter?.includeDeleted) clauses.push('deleted_at IS NULL');
    if (filter?.approval) {
      clauses.push('approval = ?');
      params.push(filter.approval);
    }
    if (filter?.category) {
      clauses.push('category = ?');
      params.push(filter.category);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM memories ${where} ORDER BY created_at DESC`).all(...params);
    let result = rows.map(rowToMemory);
    if (filter?.sensitivityMax) {
      const maxOrder = SENSITIVITY_ORDER[filter.sensitivityMax] ?? 3;
      result = result.filter((m) => (SENSITIVITY_ORDER[m.sensitivity] ?? 0) <= maxOrder);
    }
    return result;
  }

  search(query: string, limit = 20): Memory[] {
    const rows = this.db
      .prepare(
        `SELECT m.* FROM memories m
         JOIN memories_fts f ON f.rowid = m.rowid
         WHERE memories_fts MATCH ? AND m.approval = 'approved' AND m.deleted_at IS NULL
         ORDER BY rank
         LIMIT ?`
      )
      .all(query, limit);
    return rows.map(rowToMemory);
  }

  updateApproval(id: string, approval: Memory['approval'], now: string): void {
    this.db
      .prepare('UPDATE memories SET approval = ?, last_confirmed_at = ? WHERE id = ?')
      .run(approval, now, id);
  }

  softDelete(id: string, now: string): void {
    this.db.prepare('UPDATE memories SET deleted_at = ? WHERE id = ?').run(now, id);
  }

  markSuperseded(oldId: string, newId: string, now: string): void {
    this.db
      .prepare('UPDATE memories SET supersedes_id = ?, deleted_at = COALESCE(deleted_at, ?) WHERE id = ?')
      .run(newId, now, oldId);
  }

  recordEvent(event: MemoryEvent): void {
    this.db
      .prepare('INSERT INTO memory_events (id, memory_id, type, detail_json, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(event.id, event.memoryId, event.type, JSON.stringify(event.detail ?? {}), event.createdAt);
  }

  eventsFor(memoryId: string): MemoryEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM memory_events WHERE memory_id = ? ORDER BY created_at ASC')
      .all(memoryId);
    return rows.map(rowToEvent);
  }

  listProposed(): Memory[] {
    return this.list({ approval: 'proposed' });
  }
}



