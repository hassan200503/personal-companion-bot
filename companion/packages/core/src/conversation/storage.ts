import type { ConversationRole } from './contracts.js';
import type { SqliteConnection } from '../storage/types.js';
import type { Conversation, ConversationMessage, ConversationStore } from './contracts.js';

function rowToMessage(row: { id: string; role: string; content: string; created_at: string; provider_id: string | null; model: string | null; status: string }): ConversationMessage {
  return {
    id: row.id,
    role: row.role as ConversationRole,
    content: row.content,
    createdAt: row.created_at,
    providerId: row.provider_id ?? undefined,
    model: row.model ?? undefined,
    status: row.status as 'completed' | 'failed' | 'drafted',
  };
}

export class SqliteConversationStore implements ConversationStore {
  constructor(private readonly db: SqliteConnection) {}

  loadAll(): Conversation[] {
    const convRows = this.db.prepare('SELECT * FROM conversations ORDER BY created_at ASC').all() as Array<{ id: string; title: string | null; created_at: string; updated_at: string }>;
    const result: Conversation[] = [];
    for (const c of convRows) {
      const msgRows = this.db
        .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
        .all(c.id) as Array<{ id: string; role: string; content: string; created_at: string; provider_id: string | null; model: string | null; status: string }>;
      result.push({
        id: c.id,
        title: c.title ?? undefined,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        messages: msgRows.map(rowToMessage),
      });
    }
    return result;
  }

  saveConversation(conversation: Conversation): void {
    const now = conversation.updatedAt;
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at`
      )
      .run(conversation.id, conversation.title ?? null, conversation.createdAt, now);

    // upsert messages
    const existing = new Set(
      (
        this.db
          .prepare('SELECT id FROM messages WHERE conversation_id = ?')
          .all(conversation.id) as Array<{ id: string }>
      ).map((r) => r.id)
    );
    for (const m of conversation.messages) {
      if (existing.has(m.id)) {
        this.db
          .prepare(
            'UPDATE messages SET role=?, content=?, created_at=?, provider_id=?, model=?, status=? WHERE id=?'
          )
          .run(m.role, m.content, m.createdAt, m.providerId ?? null, m.model ?? null, m.status, m.id);
      } else {
        this.db
          .prepare(
            'INSERT INTO messages (id, conversation_id, role, content, created_at, provider_id, model, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .run(m.id, conversation.id, m.role, m.content, m.createdAt, m.providerId ?? null, m.model ?? null, m.status);
      }
    }
    // remove deleted messages
    const ids = new Set(conversation.messages.map((m) => m.id));
    for (const id of existing) {
      if (!ids.has(id)) {
        this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
      }
    }
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }
}


