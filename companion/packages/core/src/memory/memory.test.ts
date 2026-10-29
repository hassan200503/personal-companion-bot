import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCompanionDatabase } from '../storage/database.js';
import type { CompanionDatabase } from '../storage/database.js';
import { createTempDir, createTestLogger, FakeKeyProtector, removeTempDir } from '../storage/test-helpers.js';
import { SqliteMemoryRepository } from './repository.js';
import { createMemoryRetriever } from './retriever.js';
import { createMemoryRecorder } from './recorder.js';
import { correctMemory } from './corrections.js';
import { listApprovalInbox, approveMemory, rejectMemory, getMemoryTimeline, wasMemoryRejected } from './approval.js';

describe('memory pipeline', () => {
  let tempDir: string;
  let protector: FakeKeyProtector;
  let db: CompanionDatabase;

  beforeEach(async () => {
    tempDir = await createTempDir();
    protector = new FakeKeyProtector();
    const { logger } = createTestLogger();
    db = await openCompanionDatabase({ userDataDir: tempDir, keyProtector: protector, logger });
  });

  afterEach(async () => {
    db?.close();
    await removeTempDir(tempDir);
  });

  it('records proposed memories and approval inbox', async () => {
    const repo = new SqliteMemoryRepository(db.raw);
    const recorder = createMemoryRecorder(repo, { now: () => new Date('2025-01-01T00:00:00.000Z') });
    await recorder({ category: 'fact', content: 'User likes tea', origin: 'explicit' });
    const inbox = listApprovalInbox(repo);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.approval).toBe('proposed');
  });

  it('approves and retrieves approved memories', async () => {
    const repo = new SqliteMemoryRepository(db.raw);
    const recorder = createMemoryRecorder(repo, { now: () => new Date('2025-01-01T00:00:00.000Z') });
    await recorder({ category: 'fact', content: 'User likes tea', origin: 'explicit' });
    const mem = repo.listProposed()[0]!;
    approveMemory(repo, mem.id, () => new Date('2025-01-02T00:00:00.000Z'));
    expect(repo.getById(mem.id)?.approval).toBe('approved');

    const retriever = createMemoryRetriever(repo);
    const snippets = await retriever('tea');
    expect(snippets).toContain('User likes tea');
  });

  it('rejects memory', async () => {
    const repo = new SqliteMemoryRepository(db.raw);
    const recorder = createMemoryRecorder(repo, { now: () => new Date('2025-01-01T00:00:00.000Z') });
    await recorder({ category: 'fact', content: 'bad', origin: 'inferred' });
    const mem = repo.listProposed()[0]!;
    rejectMemory(repo, mem.id, () => new Date('2025-01-02T00:00:00.000Z'));
    expect(repo.getById(mem.id)?.approval).toBe('rejected');
    expect(wasMemoryRejected(repo, 'FACT', ' bad ')).toBe(true);
    expect(wasMemoryRejected(repo, 'fact', 'different')).toBe(false);
  });

  it('corrects a memory and records timeline', async () => {
    const repo = new SqliteMemoryRepository(db.raw);
    const now = () => new Date('2025-01-01T00:00:00.000Z');
    const recorder = createMemoryRecorder(repo, { now });
    await recorder({ category: 'fact', content: 'User likes coffee', origin: 'explicit' });
    const old = repo.listProposed()[0]!;
    approveMemory(repo, old.id, now);
    const corrected = correctMemory(repo, { oldMemoryId: old.id, newContent: 'User likes tea', reason: 'correction' }, { now });
    expect(repo.getById(old.id)?.deletedAt).toBeTruthy();
    expect(repo.getById(corrected.id)?.content).toBe('User likes tea');
    const events = getMemoryTimeline(repo, old.id);
    expect(events.some((e) => e.type === 'superseded')).toBe(true);
  });

  it('conversation recorder stores exchange', async () => {
    const repo = new SqliteMemoryRepository(db.raw);
    const recorder = createMemoryRecorder(repo, { now: () => new Date('2025-01-01T00:00:00.000Z') });
    const fn = recorder;
    await fn('hello', 'hi there');
    const mems = repo.list({ includeDeleted: true });
    expect(mems).toHaveLength(1);
    expect(mems[0]!.category).toBe('conversation');
  });

  it('can disable conversation-content learning by default for the desktop app', async () => {
    const repo = new SqliteMemoryRepository(db.raw);
    const recorder = createMemoryRecorder(repo, { recordConversation: false });
    await recorder('message from another person', 'assistant summary');
    expect(repo.list({ includeDeleted: true })).toHaveLength(0);
  });
});







