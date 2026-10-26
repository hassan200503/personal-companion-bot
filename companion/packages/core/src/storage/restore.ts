import { randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../logger";
import { ensurePrivateDir, removeIfExists, sqlStringLiteral, toFilesystemTimestamp, writeFileAtomic } from "./atomic";
import type { KeyProtector } from "./contracts";
import {
  buildStoragePaths,
  openCompanionDatabase,
  openEncryptedConnection,
  removeDatabaseFiles,
  verifyDatabaseCipherParameters
} from "./database";
import { StorageError, wrapStorageError } from "./errors";
import { createKeyManifest, writeKeyManifest } from "./key-manifest";
import { decryptPortableExport } from "./portable-export";
import { migrateUp, migrationList, validateMigrationSet, type Migration } from "./migrations";
import type { SqliteConnection } from "./types";

export interface RestorePortableOptions {
  exportPath: string;
  passphrase: string;
  userDataDir: string;
  keyProtector: KeyProtector;
  logger?: Logger;
  now?: () => Date;
  migrations?: readonly Migration[];
}

export interface RestorePortableResult {
  keyId: string;
  schemaVersion: number;
  exportCreatedAt: string;
  preRestoreSnapshotPath?: string;
  preRestoreBackupDir?: string;
}

async function copyIfExists(source: string, destination: string): Promise<boolean> {
  if (!existsSync(source)) {
    return false;
  }

  await copyFile(source, destination);
  return true;
}

export async function restorePortableDatabase(
  options: RestorePortableOptions
): Promise<RestorePortableResult> {
  const paths = buildStoragePaths(options.userDataDir);
  const now = options.now ?? (() => new Date());
  const migrations = options.migrations ?? migrationList;
  const logger = options.logger;
  validateMigrationSet(migrations);

  const decrypted = await decryptPortableExport(options.exportPath, options.passphrase);
  const latestVersion = migrations[migrations.length - 1]?.version ?? 0;
  const embeddedKey = decrypted.plaintextHeader.databaseKey;

  if (decrypted.plaintextHeader.schemaVersion > latestVersion) {
    throw new StorageError(
      "export_incompatible",
      "The portable export comes from a newer app version and cannot be restored."
    );
  }

  await ensurePrivateDir(paths.dataDir);
  await ensurePrivateDir(paths.keyDir);
  await ensurePrivateDir(paths.backupDir);

  const stagingDir = join(paths.dataDir, `restore-staging-${randomUUID()}`);
  const stagedDatabase = join(stagingDir, "companion.db");
  await ensurePrivateDir(stagingDir);
  await writeFileAtomic(stagedDatabase, decrypted.databaseBytes);

  let connection: SqliteConnection | undefined;
  let newKeyBytes: Buffer | undefined;
  let backupDir: string | undefined;
  let replaced = false;

  try {
    connection = openEncryptedConnection(stagedDatabase, embeddedKey, logger);
    verifyDatabaseCipherParameters(connection);
    migrateUp(connection, migrations, now);
    connection.pragma("wal_checkpoint(TRUNCATE)");

    newKeyBytes = randomBytes(32);
    const newKeyText = newKeyBytes.toString("base64url");
    connection.pragma(`rekey = ${sqlStringLiteral(newKeyText)}`);
    connection.pragma("wal_checkpoint(TRUNCATE)");
    connection.close();
    connection = undefined;

    connection = openEncryptedConnection(stagedDatabase, newKeyText, logger);
    verifyDatabaseCipherParameters(connection);
    connection.pragma("wal_checkpoint(TRUNCATE)");
    connection.close();
    connection = undefined;

    let preRestoreSnapshotPath: string | undefined;

    if (existsSync(paths.databaseFile)) {
      try {
        const existing = await openCompanionDatabase({
          userDataDir: options.userDataDir,
          keyProtector: options.keyProtector,
          logger,
          now,
          runMigrations: false
        });

        try {
          preRestoreSnapshotPath = await existing.snapshot(
            join(paths.backupDir, `pre-restore-${toFilesystemTimestamp(now())}.db`)
          );
        } finally {
          existing.close();
        }
      } catch (error) {
        logger?.warn("no pre-restore snapshot was created because the current database could not be opened", {
          code: error instanceof StorageError ? error.code : "unknown"
        });
      }
    }

    const backupTimestamp = toFilesystemTimestamp(now());
    backupDir = join(paths.backupDir, `pre-restore-${backupTimestamp}`);
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    await copyIfExists(paths.databaseFile, join(backupDir, "companion.db"));
    await copyIfExists(paths.wrappedKeyFile, join(backupDir, "db-key.bin"));
    await copyIfExists(paths.keyManifestFile, join(backupDir, "db-key.json"));

    await removeIfExists(`${paths.databaseFile}-wal`);
    await removeIfExists(`${paths.databaseFile}-shm`);
    await removeIfExists(`${paths.databaseFile}-journal`);
    await rename(stagedDatabase, paths.databaseFile);
    replaced = true;
    await removeIfExists(`${paths.databaseFile}-wal`);
    await removeIfExists(`${paths.databaseFile}-shm`);

    await writeFileAtomic(
      paths.wrappedKeyFile,
      await options.keyProtector.wrap(Buffer.from(newKeyText, "utf8"))
    );
    const manifest = createKeyManifest({
      keyId: randomUUID(),
      createdAt: now(),
      wrapMethod: options.keyProtector.id,
      protectorId: options.keyProtector.id
    });
    await writeKeyManifest(paths.keyManifestFile, manifest);

    const verification = await openCompanionDatabase({
      userDataDir: options.userDataDir,
      keyProtector: options.keyProtector,
      logger,
      now,
      runMigrations: false
    });
    const keyId = verification.keyId;
    const schemaVersion = verification.schemaVersion;
    verification.close();

    return {
      keyId,
      schemaVersion,
      exportCreatedAt: decrypted.manifest.createdAt,
      preRestoreSnapshotPath,
      preRestoreBackupDir: backupDir
    };
  } catch (error) {
    connection?.close();

    if (replaced) {
      try {
        if (backupDir !== undefined && existsSync(join(backupDir, "companion.db"))) {
          await removeDatabaseFiles(paths.databaseFile);
          await copyFile(join(backupDir, "companion.db"), paths.databaseFile);
          await copyIfExists(join(backupDir, "db-key.bin"), paths.wrappedKeyFile);
          await copyIfExists(join(backupDir, "db-key.json"), paths.keyManifestFile);
        } else {
          await removeDatabaseFiles(paths.databaseFile);
          await removeIfExists(paths.wrappedKeyFile);
          await removeIfExists(paths.keyManifestFile);
        }
      } catch (rollbackError) {
        logger?.error("restore rollback failed", {
          code: rollbackError instanceof Error ? rollbackError.name : "unknown"
        });
      }
    }

    if (error instanceof StorageError) {
      throw error;
    }

    throw wrapStorageError("restore_failed", "The portable export could not be restored.", error);
  } finally {
    newKeyBytes?.fill(0);
    await rm(stagingDir, { recursive: true, force: true });
  }
}
