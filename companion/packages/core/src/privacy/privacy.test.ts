import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCompanionDatabase } from '../storage/database.js';
import type { CompanionDatabase } from '../storage/database.js';
import { createTempDir, createTestLogger, FakeKeyProtector, removeTempDir } from '../storage/test-helpers.js';
import { exportAllData, deleteAllData } from './contracts.js';

describe('privacy export/delete', () => {
  let tempDir: string;
  let db: CompanionDatabase;
  beforeEach(async () => {
    tempDir = await createTempDir();
    db = await openCompanionDatabase({ userDataDir: tempDir, keyProtector: new FakeKeyProtector(), logger: createTestLogger().logger });
  });
  afterEach(async () => { db?.close(); await removeTempDir(tempDir); });

  it('exports and deletes data', () => {
    const now = new Date().toISOString();
    db.raw.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?,?,?,?)').run('c1', 't', now, now);
    const before = exportAllData(db.raw);
    expect(before.conversations.length).toBe(1);
    deleteAllData(db.raw);
    const after = exportAllData(db.raw);
    expect(after.conversations.length).toBe(0);
  });
});



