import { existsSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildStoragePaths,
  migrateDown,
  migrateUp,
  migrationList,
  openCompanionDatabase,
  type Migration
} from "./index";
import {
  createTempDir,
  createTestLogger,
  FakeKeyProtector,
  removeTempDir,
  seedConversation,
  seedMemory
} from "./test-helpers";

const marker = "persistent-marker-jasmine-tea";

async function readIfExists(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

describe("encrypted companion storage", () => {
  let tempDir: string;
  let protector: FakeKeyProtector;

  beforeEach(async () => {
    tempDir = await createTempDir();
    protector = new FakeKeyProtector();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("creates a SQLCipher database with pinned parameters and persists data across reopen", async () => {
    const { logger, lines } = createTestLogger();
    let database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector,
      logger
    });

    expect(database.schemaVersion).toBe(1);
    expect({
      cipher: String(database.raw.pragma("cipher", { simple: true })),
      legacy: Number(database.raw.pragma("legacy", { simple: true })),
      kdfIterations: Number(database.raw.pragma("kdf_iter", { simple: true })),
      pageSize: Number(database.raw.pragma("page_size", { simple: true })),
      journalMode: String(database.raw.pragma("journal_mode", { simple: true })).toLowerCase(),
      tempStore: Number(database.raw.pragma("temp_store", { simple: true })),
      foreignKeys: Number(database.raw.pragma("foreign_keys", { simple: true }))
    }).toEqual({
      cipher: "sqlcipher",
      legacy: 0,
      kdfIterations: 256000,
      pageSize: 4096,
      journalMode: "wal",
      tempStore: 2,
      foreignKeys: 1
    });

    seedConversation(database, marker);
    seedMemory(database, "The owner prefers jasmine tea.");
    const keyText = protector.lastKeyText;

    expect(keyText).not.toBeNull();
    database.close();

    const paths = buildStoragePaths(tempDir);

    for (const filePath of [paths.databaseFile, `${paths.databaseFile}-wal`]) {
      const contents = await readIfExists(filePath);

      if (contents !== null) {
        expect(contents.includes(Buffer.from(marker, "utf8"))).toBe(false);
        expect(contents.includes(Buffer.from(keyText ?? "", "utf8"))).toBe(false);
      }
    }

    database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector,
      logger
    });

    const message = database.raw
      .prepare("SELECT content FROM messages WHERE id = ?")
      .get("message-1") as { content: string };
    const matches = database.raw
      .prepare(
        `SELECT m.content AS content
           FROM messages_fts
           JOIN messages m ON m.rowid = messages_fts.rowid
          WHERE messages_fts MATCH ?`
      )
      .all("jasmine") as Array<{ content: string }>;

    expect(message.content).toBe(marker);
    expect(matches).toHaveLength(1);
    expect(database.raw.prepare("SELECT count(*) AS count FROM memories").get()).toEqual({
      count: 1
    });

    database.close();

    const combinedLogs = lines.join("\n");
    expect(combinedLogs).not.toContain(keyText ?? "");
    expect(combinedLogs).not.toContain(marker);
  });

  it("re-wraps the database key when the protector asks for it", async () => {
    const first = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    first.close();
    const wrapsBefore = protector.wrapCount;

    protector.shouldReEncrypt = true;
    const second = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    second.close();

    expect(protector.wrapCount).toBe(wrapsBefore + 1);
  });

  it("fails closed when the database key files are missing", async () => {
    const database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    seedConversation(database, marker);
    database.close();

    const paths = buildStoragePaths(tempDir);
    await rm(paths.wrappedKeyFile, { force: true });
    await rm(paths.keyManifestFile, { force: true });

    await expect(
      openCompanionDatabase({ userDataDir: tempDir, keyProtector: protector })
    ).rejects.toMatchObject({ code: "key_missing" });

    expect(existsSync(paths.databaseFile)).toBe(true);
  });

  it("rejects a wrong key without destroying the database", async () => {
    let database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    seedConversation(database, marker);
    database.close();

    const paths = buildStoragePaths(tempDir);
    const correctWrapped = await readFile(paths.wrappedKeyFile);
    const wrongKey = Buffer.alloc(32, 9).toString("base64url");
    await writeFile(paths.wrappedKeyFile, await protector.wrap(Buffer.from(wrongKey, "utf8")));

    await expect(
      openCompanionDatabase({ userDataDir: tempDir, keyProtector: protector })
    ).rejects.toMatchObject({ code: "database_unreadable" });

    await writeFile(paths.wrappedKeyFile, correctWrapped);
    database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    const row = database.raw
      .prepare("SELECT content FROM messages WHERE id = ?")
      .get("message-1") as { content: string };
    expect(row.content).toBe(marker);
    database.close();
  });

  it("does not touch the disk when the key protector is unavailable", async () => {
    protector.available = false;

    await expect(
      openCompanionDatabase({ userDataDir: tempDir, keyProtector: protector })
    ).rejects.toMatchObject({ code: "key_protector_unavailable" });

    const paths = buildStoragePaths(tempDir);
    expect(existsSync(paths.databaseFile)).toBe(false);
    expect(existsSync(paths.wrappedKeyFile)).toBe(false);
  });

  it("rolls back a failed migration and leaves a pre-migration snapshot", async () => {
    const first = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    seedConversation(first, marker);
    first.close();

    const failingMigration: Migration = {
      version: 2,
      name: "failing-migration",
      up: "CREATE TABLE extra_table (id TEXT); INSERT INTO missing_table VALUES ('x');",
      down: "DROP TABLE extra_table;"
    };

    await expect(
      openCompanionDatabase({
        userDataDir: tempDir,
        keyProtector: protector,
        migrations: [...migrationList, failingMigration]
      })
    ).rejects.toMatchObject({ code: "migration_failed" });

    const paths = buildStoragePaths(tempDir);
    const snapshots = (await readdir(paths.backupDir)).filter((name) =>
      name.startsWith("pre-migration-v1-")
    );
    expect(snapshots).toHaveLength(1);

    const reopened = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    const extra = reopened.raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'extra_table'")
      .get();
    const row = reopened.raw
      .prepare("SELECT content FROM messages WHERE id = ?")
      .get("message-1") as { content: string };

    expect(extra).toBeUndefined();
    expect(reopened.schemaVersion).toBe(1);
    expect(row.content).toBe(marker);
    reopened.close();
  });

  it("rejects a migration checksum mismatch", async () => {
    const database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    database.raw.prepare("UPDATE schema_migrations SET checksum = 'tampered'").run();
    database.close();

    await expect(
      openCompanionDatabase({ userDataDir: tempDir, keyProtector: protector })
    ).rejects.toMatchObject({ code: "migration_checksum_mismatch" });
  });

  it("supports migrating down to zero and back up", async () => {
    const database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    seedConversation(database, marker);

    migrateDown(database.raw, 0, migrationList);
    expect(
      database.raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
        .get()
    ).toBeUndefined();
    expect(database.raw.pragma("user_version", { simple: true })).toBe(0);

    migrateUp(database.raw, migrationList);
    expect(
      database.raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
        .get()
    ).toBeDefined();
    expect(database.raw.pragma("user_version", { simple: true })).toBe(1);
    database.close();
  });

  it("keeps message and memory FTS indexes in sync on update and delete", async () => {
    const database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    seedConversation(database, "The quick brown fox");
    seedMemory(database, "The owner enjoys hiking");

    const messageMatches = (term: string): number =>
      (
        database.raw
          .prepare(
            `SELECT count(*) AS count
               FROM messages_fts
               JOIN messages m ON m.rowid = messages_fts.rowid
              WHERE messages_fts MATCH ?`
          )
          .get(term) as { count: number }
      ).count;
    const memoryMatches = (term: string): number =>
      (
        database.raw
          .prepare(
            `SELECT count(*) AS count
               FROM memories_fts
               JOIN memories m ON m.rowid = memories_fts.rowid
              WHERE memories_fts MATCH ?`
          )
          .get(term) as { count: number }
      ).count;

    expect(messageMatches("brown")).toBe(1);
    expect(memoryMatches("hiking")).toBe(1);

    database.raw.prepare("UPDATE messages SET content = 'The lazy dog' WHERE id = ?").run("message-1");
    expect(messageMatches("brown")).toBe(0);
    expect(messageMatches("lazy")).toBe(1);

    database.raw.prepare("DELETE FROM messages WHERE id = ?").run("message-1");
    expect(messageMatches("lazy")).toBe(0);

    database.raw.prepare("UPDATE memories SET content = 'The owner enjoys gardening' WHERE id = ?").run("memory-1");
    expect(memoryMatches("hiking")).toBe(0);
    expect(memoryMatches("gardening")).toBe(1);
    database.close();
  });
});
