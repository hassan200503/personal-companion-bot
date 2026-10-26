import { existsSync } from "node:fs";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildStoragePaths,
  decryptPortableExport,
  openCompanionDatabase,
  openEncryptedConnection,
  readDatabaseKeyForRestore,
  restorePortableDatabase
} from "./index";
import {
  createTempDir,
  createTestLogger,
  FakeKeyProtector,
  removeTempDir,
  seedConversation
} from "./test-helpers";

const passphrase = "correct horse battery staple";
const marker = "backup-marker-jasmine-tea";

async function scanDirectoryForText(directory: string, text: string): Promise<string[]> {
  const hits: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  const needle = Buffer.from(text, "utf8");

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      hits.push(...(await scanDirectoryForText(fullPath, text)));
    } else if (entry.isFile()) {
      const contents = await readFile(fullPath);

      if (contents.includes(needle)) {
        hits.push(fullPath);
      }
    }
  }

  return hits;
}

describe("encrypted backup and recovery", () => {
  let tempDir: string;
  let protector: FakeKeyProtector;

  beforeEach(async () => {
    tempDir = await createTempDir();
    protector = new FakeKeyProtector();
  });

  afterEach(async () => {
    await removeTempDir(tempDir);
  });

  it("creates an encrypted local snapshot that reopens with the same key", async () => {
    const database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    seedConversation(database, marker);
    const keyText = protector.lastKeyText;
    const snapshotPath = await database.snapshot();
    database.close();

    expect(existsSync(snapshotPath)).toBe(true);
    const snapshotBytes = await readFile(snapshotPath);
    expect(snapshotBytes.includes(Buffer.from(marker, "utf8"))).toBe(false);
    expect(snapshotBytes.includes(Buffer.from(keyText ?? "", "utf8"))).toBe(false);

    const restored = await readDatabaseKeyForRestore(buildStoragePaths(tempDir), protector);
    const connection = openEncryptedConnection(snapshotPath, restored.keyText);
    const row = connection
      .prepare("SELECT content FROM messages WHERE id = ?")
      .get("message-1") as { content: string };
    expect(row.content).toBe(marker);
    connection.close();
    restored.keyBytes.fill(0);
  });

  it("round-trips a portable export into a fresh profile with a new local key", async () => {
    const database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });
    seedConversation(database, marker);
    const originalKeyId = database.keyId;
    const exportPath = join(tempDir, "owner-export.companion-backup");
    const summary = await database.exportPortable({ destination: exportPath, passphrase });
    const keyText = protector.lastKeyText;
    database.close();

    expect(summary.schemaVersion).toBe(1);
    const exportBytes = await readFile(exportPath);
    expect(exportBytes.includes(Buffer.from(marker, "utf8"))).toBe(false);
    expect(exportBytes.includes(Buffer.from(keyText ?? "", "utf8"))).toBe(false);

    await expect(decryptPortableExport(exportPath, "this passphrase is wrong")).rejects.toMatchObject({
      code: "export_auth_failed"
    });

    const decrypted = await decryptPortableExport(exportPath, passphrase);
    expect(decrypted.plaintextHeader.schemaVersion).toBe(1);
    expect(decrypted.databaseBytes.includes(Buffer.from(marker, "utf8"))).toBe(false);

    const tamperedPath = join(tempDir, "tampered.companion-backup");
    await copyFile(exportPath, tamperedPath);
    const tamperedBytes = await readFile(tamperedPath);
    tamperedBytes[tamperedBytes.length - 1] = (tamperedBytes[tamperedBytes.length - 1] ?? 0) ^ 0xff;
    await writeFile(tamperedPath, tamperedBytes);

    await expect(decryptPortableExport(tamperedPath, passphrase)).rejects.toMatchObject({
      code: "export_auth_failed"
    });

    const restoreDir = await createTempDir();
    const restoringProtector = new FakeKeyProtector();

    try {
      const result = await restorePortableDatabase({
        exportPath,
        passphrase,
        userDataDir: restoreDir,
        keyProtector: restoringProtector
      });

      expect(result.keyId).not.toBe(originalKeyId);
      expect(result.schemaVersion).toBe(1);

      const restored = await openCompanionDatabase({
        userDataDir: restoreDir,
        keyProtector: restoringProtector
      });
      const row = restored.raw
        .prepare("SELECT content FROM messages WHERE id = ?")
        .get("message-1") as { content: string };
      const matches = restored.raw
        .prepare(
          `SELECT count(*) AS count
             FROM messages_fts
             JOIN messages m ON m.rowid = messages_fts.rowid
            WHERE messages_fts MATCH ?`
        )
        .get("jasmine") as { count: number };

      expect(row.content).toBe(marker);
      expect(matches.count).toBe(1);
      restored.close();

      const restoredDatabaseBytes = await readFile(
        buildStoragePaths(restoreDir).databaseFile
      );
      expect(restoredDatabaseBytes.includes(Buffer.from(marker, "utf8"))).toBe(false);
    } finally {
      await removeTempDir(restoreDir);
    }
  });

  it("rejects a short export passphrase before writing anything", async () => {
    const database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector
    });

    await expect(
      database.exportPortable({
        destination: join(tempDir, "too-short.companion-backup"),
        passphrase: "short"
      })
    ).rejects.toMatchObject({ code: "invalid_passphrase" });

    expect(existsSync(join(tempDir, "too-short.companion-backup"))).toBe(false);
    database.close();
  });

  it("keeps a pre-restore snapshot and backup when replacing an existing profile", async () => {
    const sourceDir = await createTempDir();
    const sourceProtector = new FakeKeyProtector();
    const targetDir = await createTempDir();
    const targetProtector = new FakeKeyProtector();

    try {
      const source = await openCompanionDatabase({
        userDataDir: sourceDir,
        keyProtector: sourceProtector
      });
      seedConversation(source, "source-marker");
      const exportPath = join(sourceDir, "source.companion-backup");
      await source.exportPortable({ destination: exportPath, passphrase });
      source.close();

      const target = await openCompanionDatabase({
        userDataDir: targetDir,
        keyProtector: targetProtector
      });
      seedConversation(target, "old-target-marker");
      target.close();

      const result = await restorePortableDatabase({
        exportPath,
        passphrase,
        userDataDir: targetDir,
        keyProtector: targetProtector
      });

      expect(result.preRestoreSnapshotPath).toBeDefined();
      expect(existsSync(result.preRestoreSnapshotPath ?? "")).toBe(true);
      expect(result.preRestoreBackupDir).toBeDefined();
      expect(existsSync(join(result.preRestoreBackupDir ?? "", "companion.db"))).toBe(true);
      expect(existsSync(join(result.preRestoreBackupDir ?? "", "db-key.bin"))).toBe(true);

      const reopened = await openCompanionDatabase({
        userDataDir: targetDir,
        keyProtector: targetProtector
      });
      const rows = reopened.raw
        .prepare("SELECT content FROM messages ORDER BY created_at")
        .all() as Array<{ content: string }>;
      expect(rows.map((row) => row.content)).toEqual(["source-marker"]);
      reopened.close();
    } finally {
      await removeTempDir(sourceDir);
      await removeTempDir(targetDir);
    }
  });

  it("finds no database key or message marker in storage files, logs or exports", async () => {
    const { logger, lines } = createTestLogger();
    const database = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector: protector,
      logger
    });
    seedConversation(database, marker);
    const keyText = protector.lastKeyText;
    await database.snapshot();
    const exportPath = join(tempDir, "scan.companion-backup");
    await database.exportPortable({ destination: exportPath, passphrase });
    database.close();

    expect(keyText).not.toBeNull();
    const keyHits = await scanDirectoryForText(tempDir, keyText ?? "");
    const markerHits = await scanDirectoryForText(tempDir, marker);
    expect(keyHits).toEqual([]);
    expect(markerHits).toEqual([]);
    expect(lines.join("\n")).not.toContain(keyText ?? "");
    expect(lines.join("\n")).not.toContain(marker);
  });
});
