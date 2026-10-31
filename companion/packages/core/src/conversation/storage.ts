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
    const rows = this.db.prepare(
      `SELECT c.id AS conversation_id, c.title, c.created_at AS conversation_created_at, c.updated_at AS conversation_updated_at,
              m.id AS message_id, m.role, m.content, m.created_at AS message_created_at,
              m.provider_id, m.model, m.status
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
        ORDER BY c.created_at ASC, m.created_at ASC`
    ).all() as Array<{
      conversation_id: string;
      title: string | null;
      conversation_created_at: string;
      conversation_updated_at: string;
      message_id: string | null;
      role: string | null;
      content: string | null;
      message_created_at: string | null;
      provider_id: string | null;
      model: string | null;
      status: string | null;
    }>;

    const byId = new Map<string, Conversation>();
    for (const row of rows) {
      let conversation = byId.get(row.conversation_id);
      if (!conversation) {
        conversation = {
          id: row.conversation_id,
          title: row.title ?? undefined,
          createdAt: row.conversation_created_at,
          updatedAt: row.conversation_updated_at,
          messages: [],
        };
        byId.set(row.conversation_id, conversation);
      }
      if (row.message_id && row.role && row.content !== null && row.message_created_at) {
        conversation.messages.push(rowToMessage({
          id: row.message_id,
          role: row.role,
          content: row.content,
          created_at: row.message_created_at,
          provider_id: row.provider_id,
          model: row.model,
          status: row.status ?? 'completed',
        }));
      }
    }
    return Array.from(byId.values());
  }

  saveConversation(conversation: Conversation): void {
    const write = this.db.transaction(() => {
      this.upsertConversation(conversation);
      const existing = new Map(
        (
          this.db
            .prepare('SELECT id, role, content, created_at, provider_id, model, status FROM messages WHERE conversation_id = ?')
            .all(conversation.id) as Array<{
              id: string;
              role: string;
              content: string;
              created_at: string;
              provider_id: string | null;
              model: string | null;
              status: string;
            }>
        ).map((row) => [row.id, row])
      );

      for (const message of conversation.messages) {
        const previous = existing.get(message.id);
        if (previous && this.messageMatches(previous, message)) {
          existing.delete(message.id);
          continue;
        }
        if (previous) existing.delete(message.id);
        this.upsertMessage(conversation.id, message);
      }
      for (const id of existing.keys()) {
        this.db.prepare('DELETE FROM messages WHERE id = ?').run(id);
      }
    });
    write();
  }

  appendMessage(conversation: Conversation, message: ConversationMessage): void {
    const write = this.db.transaction(() => {
      this.upsertConversation(conversation);
      this.upsertMessage(conversation.id, message);
    });
    write();
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  private upsertConversation(conversation: Conversation): void {
    this.db
      .prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at`
      )
      .run(conversation.id, conversation.title ?? null, conversation.createdAt, conversation.updatedAt);
  }

  private upsertMessage(conversationId: string, message: ConversationMessage): void {
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, provider_id, model, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET role=excluded.role, content=excluded.content, created_at=excluded.created_at,
           provider_id=excluded.provider_id, model=excluded.model, status=excluded.status`
      )
      .run(
        message.id,
        conversationId,
        message.role,
        message.content,
        message.createdAt,
        message.providerId ?? null,
        message.model ?? null,
        message.status
      );
  }

  private messageMatches(
    row: { role: string; content: string; created_at: string; provider_id: string | null; model: string | null; status: string },
    message: ConversationMessage
  ): boolean {
    return row.role === message.role &&
      row.content === message.content &&
      row.created_at === message.createdAt &&
      row.provider_id === (message.providerId ?? null) &&
      row.model === (message.model ?? null) &&
      row.status === message.status;
  }
}


