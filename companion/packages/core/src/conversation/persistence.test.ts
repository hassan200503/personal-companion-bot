import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCompanionDatabase } from '../storage/database.js';
import type { CompanionDatabase } from '../storage/database.js';
import { createTempDir, createTestLogger, FakeKeyProtector, removeTempDir } from '../storage/test-helpers.js';
import { MockProvider } from '../providers/mock-provider.js';
import { ProviderRouter } from '../providers/router.js';
import { DefaultConversationEngine } from './engine.js';
import { SqliteConversationStore } from './storage.js';

describe('conversation persistence', () => {
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

  it('persists conversations across engine instances', async () => {
    const provider = new MockProvider({ id: 'mock', responseContent: 'hi' });
    const router = new ProviderRouter({ maxRetries: 1 });
    router.register(provider, 10);

    const store1 = new SqliteConversationStore(db.raw);
    const engine1 = new DefaultConversationEngine({ router, defaultModel: 'mock-model', conversationStore: store1 });
    const conv = engine1.createConversation('t');
    await engine1.sendMessage(conv.id, 'hello', new AbortController().signal);

    const store2 = new SqliteConversationStore(db.raw);
    const engine2 = new DefaultConversationEngine({ router, defaultModel: 'mock-model', conversationStore: store2 });
    const loaded = engine2.getConversation(conv.id);
    expect(loaded).toBeDefined();
    expect(loaded!.messages.length).toBeGreaterThanOrEqual(2);
  });
});



