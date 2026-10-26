import type { SqliteConnection } from '../storage/types.js';
import type { AuditEvent, AuditLogger } from './contracts.js';

export class InMemoryAuditLogger implements AuditLogger {
  private readonly events: AuditEvent[] = [];
  record(event: AuditEvent): void {
    this.events.push({ ...event, id: this.events.length + 1 });
  }
  list(limit = 100): AuditEvent[] {
    return this.events.slice(-limit);
  }
}

export class SqliteAuditLogger implements AuditLogger {
  constructor(private readonly db: SqliteConnection) {}

  record(event: AuditEvent): void {
    this.db
      .prepare('INSERT INTO audit_log (action, outcome, detail_json, created_at) VALUES (?, ?, ?, ?)')
      .run(event.action, event.outcome, JSON.stringify(event.detail ?? {}), event.createdAt);
  }

  list(limit = 100): AuditEvent[] {
    const rows = this.db
      .prepare('SELECT id, action, outcome, detail_json, created_at FROM audit_log ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<{ id: number; action: string; outcome: string; detail_json: string | null; created_at: string }>;
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      outcome: r.outcome,
      detail: JSON.parse(r.detail_json || '{}') as Record<string, unknown>,
      createdAt: r.created_at,
    }));
  }
}




