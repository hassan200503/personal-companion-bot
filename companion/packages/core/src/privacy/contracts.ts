import { readdirSync } from 'node:fs';
import type { SqliteConnection } from '../storage/types.js';

export interface ExportedData {
  conversations: unknown[];
  messages: unknown[];
  memories: unknown[];
  memoryEvents: unknown[];
  auditLog: unknown[];
  exportedAt: string;
}

export function exportAllData(db: SqliteConnection): ExportedData {
  const conversations = db.prepare('SELECT * FROM conversations').all();
  const messages = db.prepare('SELECT * FROM messages').all();
  const memories = db.prepare('SELECT * FROM memories').all();
  const memoryEvents = db.prepare('SELECT * FROM memory_events').all();
  const auditLog = db.prepare('SELECT * FROM audit_log').all();
  return {
    conversations,
    messages,
    memories,
    memoryEvents,
    auditLog,
    exportedAt: new Date().toISOString(),
  };
}

export function deleteAllData(db: SqliteConnection): void {
  db.exec('DELETE FROM memory_events;');
  db.exec('DELETE FROM memories;');
  db.exec('DELETE FROM messages;');
  db.exec('DELETE FROM conversations;');
  db.exec('DELETE FROM audit_log;');
  db.exec('DELETE FROM onboarding_state;');
  db.exec('DELETE FROM settings;');
}

export interface BackupStatus {
  backupDir: string;
  files: string[];
}

export function backupStatus(backupDir: string): BackupStatus {
  let files: string[] = [];
  try {
    files = readdirSync(backupDir);
  } catch {
    // ignore unreadable backup directories
  }
  return { backupDir, files };
}



