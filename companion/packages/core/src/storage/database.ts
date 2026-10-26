import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import DatabaseConstructor from "better-sqlite3-multiple-ciphers";
import type { Logger } from "../logger";
import {
  ensurePrivateDir,
  removeIfExists,
  sqlStringLiteral,
  toFilesystemTimestamp,
  writeFileAtomic
} from "./atomic";
import type { KeyProtector, StoragePaths } from "./contracts";
import { StorageError, wrapStorageError } from "./errors";
import {
  createKeyManifest,
  databaseCipher,
  readKeyManifest,
  writeKeyManifest,
  type KeyManifest
} from "./key-manifest";
import {
  currentSchemaVersion,
  ensureMigrationTable,
  migrateUp,
  migrationList,
  validateMigrationSet,
  type Migration
} from "./migrations";
import { exportPortableDatabase, type PortableExportSummary } from "./portable-export";
import { createEncryptedSnapshot } from "./snapshot";
import type { SqliteConnection } from "./types";

const databaseKeyPattern = /^[A-Za-z0-9_-]{43}$/;

export function buildStoragePaths(rootDir: string): StoragePaths {
  const dataDir = join(rootDir, "data");
  const keyDir = join(rootDir, "keys");
  const backupDir = join(rootDir, "backups");

  return {
    rootDir,
    dataDir,
    keyDir,
    backupDir,
    databaseFile: join(dataDir, "companion.db"),
    wrappedKeyFile: join(keyDir, "db-key.bin"),
    keyManifestFile: join(keyDir, "db-key.json")
  };
}

export interface OpenCompanionDatabaseOptions {
  userDataDir: string;
  keyProtector: KeyProtector;
  logger?: Logger;
  now?: () => Date;
  migrations?: readonly Migration[];
  runMigrations?: boolean;
}

export interface CompanionDatabase {
  readonly raw: SqliteConnection;
  readonly paths: StoragePaths;
  readonly keyId: string;
  readonly schemaVersion: number;
  snapshot(destination?: string): Promise<string>;
  exportPortable(options: { destination: string; passphrase: string }): Promise<PortableExportSummary>;
  close(): void;
}

interface ResolvedKey {
  keyText: string;
  keyBytes: Buffer;
  manifest: KeyManifest;
}

interface PragmaSnapshot {
  cipher: string;
  legacy: number;
  kdfIterations: number;
  pageSize: number;
  journalMode: string;
  tempStore: number;
  foreignKeys: number;
}

function pragmaNumber(connection: SqliteConnection, name: string): number {
  return Number(connection.pragma(name, { simple: true }));
}

function pragmaText(connection: SqliteConnection, name: string): string {
  return String(connection.pragma(name, { simple: true }));
}

function readPragmaSnapshot(connection: SqliteConnection): PragmaSnapshot {
  return {
    cipher: pragmaText(connection, "cipher"),
    legacy: pragmaNumber(connection, "legacy"),
    kdfIterations: pragmaNumber(connection, "kdf_iter"),
    pageSize: pragmaNumber(connection, "page_size"),
    journalMode: pragmaText(connection, "journal_mode"),
    tempStore: pragmaNumber(connection, "temp_store"),
    foreignKeys: pragmaNumber(connection, "foreign_keys")
  };
}

export function verifyDatabaseCipherParameters(connection: SqliteConnection): void {
  const actual = readPragmaSnapshot(connection);

  if (
    actual.cipher !== databaseCipher.name ||
    actual.legacy !== 0 ||
    actual.kdfIterations !== databaseCipher.kdfIterations ||
    actual.pageSize !== databaseCipher.pageSize ||
    actual.journalMode.toLowerCase() !== "wal" ||
    actual.tempStore !== 2 ||
    actual.foreignKeys !== 1
  ) {
    throw new StorageError(
      "schema_incompatible",
      "The database cipher parameters do not match the supported configuration."
    );
  }
}

function describeOpenFailure(error: unknown): StorageError {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : "";

  if (
    code === "SQLITE_NOTADB" ||
    /not a database|file is encrypted|encrypted database/i.test(message)
  ) {
    return new StorageError(
      "database_unreadable",
      "The database could not be opened. The key may be wrong or the file may be damaged.",
      { cause: error }
    );
  }

  return wrapStorageError(
    "database_open_failed",
    "The encrypted database could not be opened.",
    error
  );
}

export function openEncryptedConnection(
  databaseFile: string,
  keyText: string,
  logger?: Logger
): SqliteConnection {
  const connection = new DatabaseConstructor(databaseFile);

  try {
    connection.pragma(`cipher = ${sqlStringLiteral(databaseCipher.name)}`);
    connection.pragma(`key = ${sqlStringLiteral(keyText)}`);
    connection.prepare("SELECT count(*) AS count FROM sqlite_master").get();

    connection.pragma("journal_mode = WAL");
    connection.pragma("synchronous = FULL");
    connection.pragma("foreign_keys = ON");
    connection.pragma("busy_timeout = 5000");
    connection.pragma("temp_store = MEMORY");

    try {
      connection.pragma("cipher_memory_security = ON");
    } catch (error) {
      logger?.debug("cipher_memory_security is not available in this build", {
        reason: error instanceof Error ? error.name : "unknown"
      });
    }

    verifyDatabaseCipherParameters(connection);
    return connection;
  } catch (error) {
    connection.close();
    throw describeOpenFailure(error);
  }
}

async function createNewKey(
  paths: StoragePaths,
  keyProtector: KeyProtector,
  now: () => Date
): Promise<ResolvedKey> {
  if (!(await keyProtector.isAvailable())) {
    throw new StorageError(
      "key_protector_unavailable",
      "Secure key storage is not available. The database cannot be created without OS protection."
    );
  }

  const keyBytes = randomBytes(32);
  const keyText = keyBytes.toString("base64url");
  let wrapped: Buffer;

  try {
    wrapped = await keyProtector.wrap(Buffer.from(keyText, "utf8"));
  } catch (error) {
    keyBytes.fill(0);
    throw wrapStorageError("key_wrap_failed", "The database key could not be protected.", error);
  }

  const manifest = createKeyManifest({
    keyId: randomUUID(),
    createdAt: now(),
    wrapMethod: keyProtector.id,
    protectorId: keyProtector.id
  });

  await ensurePrivateDir(paths.keyDir);
  await writeFileAtomic(paths.wrappedKeyFile, wrapped);
  await writeKeyManifest(paths.keyManifestFile, manifest);

  return { keyText, keyBytes, manifest };
}

async function loadOrCreateKey(
  paths: StoragePaths,
  keyProtector: KeyProtector,
  now: () => Date,
  logger?: Logger
): Promise<ResolvedKey> {
  const databaseExists = existsSync(paths.databaseFile);
  const manifestExists = existsSync(paths.keyManifestFile);
  const wrappedKeyExists = existsSync(paths.wrappedKeyFile);

  if (!manifestExists && !wrappedKeyExists) {
    if (databaseExists) {
      throw new StorageError(
        "key_missing",
        "The database exists but its key is missing. Restore a backup instead of creating a new key."
      );
    }

    return createNewKey(paths, keyProtector, now);
  }

  if (manifestExists !== wrappedKeyExists) {
    if (databaseExists) {
      throw new StorageError(
        "key_missing",
        "The database key files are incomplete. Restore a backup instead of creating a new key."
      );
    }

    logger?.warn("removing incomplete key files from an interrupted first run");
    await removeIfExists(paths.wrappedKeyFile);
    await removeIfExists(paths.keyManifestFile);
    return createNewKey(paths, keyProtector, now);
  }

  const manifest = await readKeyManifest(paths.keyManifestFile);
  const wrapped = await readFile(paths.wrappedKeyFile);
  let unwrapped: { key: Buffer; shouldReEncrypt: boolean };

  try {
    unwrapped = await keyProtector.unwrap(wrapped);
  } catch (error) {
    throw wrapStorageError(
      "key_unwrap_failed",
      "The database key could not be unlocked for this Windows user.",
      error
    );
  }

  const keyText = unwrapped.key.toString("utf8");

  if (!databaseKeyPattern.test(keyText)) {
    unwrapped.key.fill(0);
    throw new StorageError("key_unwrap_failed", "The unwrapped database key has an invalid shape.");
  }

  if (manifest.cipher !== databaseCipher.name) {
    unwrapped.key.fill(0);
    throw new StorageError("key_manifest_invalid", "The key manifest names an unsupported cipher.");
  }

  if (unwrapped.shouldReEncrypt) {
    try {
      const rewrapped = await keyProtector.wrap(Buffer.from(keyText, "utf8"));
      await writeFileAtomic(paths.wrappedKeyFile, rewrapped);
      logger?.info("re-wrapped the database key with the current OS protection");
    } catch (error) {
      unwrapped.key.fill(0);
      throw wrapStorageError("key_wrap_failed", "The database key could not be re-wrapped.", error);
    }
  }

  return { keyText, keyBytes: unwrapped.key, manifest };
}

function readSchemaVersion(connection: SqliteConnection): number {
  const table = connection
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get() as { name?: string } | undefined;

  if (table === undefined) {
    return pragmaNumber(connection, "user_version");
  }

  return currentSchemaVersion(connection);
}

export async function openCompanionDatabase(
  options: OpenCompanionDatabaseOptions
): Promise<CompanionDatabase> {
  const paths = buildStoragePaths(options.userDataDir);
  const now = options.now ?? (() => new Date());
  const migrations = options.migrations ?? migrationList;
  const runMigrations = options.runMigrations ?? true;
  validateMigrationSet(migrations);
  await ensurePrivateDir(paths.dataDir);
  await ensurePrivateDir(paths.keyDir);
  await ensurePrivateDir(paths.backupDir);

  const databaseExisted = existsSync(paths.databaseFile);
  const resolvedKey = await loadOrCreateKey(paths, options.keyProtector, now, options.logger);
  let connection: SqliteConnection;

  try {
    connection = openEncryptedConnection(
      paths.databaseFile,
      resolvedKey.keyText,
      options.logger
    );
  } catch (error) {
    resolvedKey.keyBytes.fill(0);

    if (!databaseExisted) {
      await removeIfExists(paths.databaseFile);
      await removeIfExists(`${paths.databaseFile}-wal`);
      await removeIfExists(`${paths.databaseFile}-shm`);
    }

    throw error;
  }

  try {
    if (runMigrations) {
      ensureMigrationTable(connection);
      const appliedVersion = currentSchemaVersion(connection);
      const targetVersion = migrations[migrations.length - 1]?.version ?? 0;

      if (databaseExisted && appliedVersion > 0 && targetVersion > appliedVersion) {
        const snapshotPath = join(
          paths.backupDir,
          `pre-migration-v${appliedVersion}-${toFilesystemTimestamp(now())}.db`
        );

        try {
          await createEncryptedSnapshot(connection, snapshotPath);
          options.logger?.info("created a pre-migration encrypted snapshot", {
            schemaVersion: appliedVersion
          });
        } catch (error) {
          throw wrapStorageError(
            "migration_snapshot_failed",
            "A pre-migration snapshot could not be created. No migration was applied.",
            error
          );
        }
      }

      migrateUp(connection, migrations, now);
    }

    const schemaVersion = readSchemaVersion(connection);
    options.logger?.info("encrypted storage opened", {
      schemaVersion,
      keyId: resolvedKey.manifest.keyId
    });

    let closed = false;
    let keyText: string = resolvedKey.keyText;
    const keyBytes = resolvedKey.keyBytes;

    return {
      raw: connection,
      paths,
      keyId: resolvedKey.manifest.keyId,
      schemaVersion,
      async snapshot(destination?: string): Promise<string> {
        const target =
          destination ??
          join(paths.backupDir, `companion-${toFilesystemTimestamp(now())}.db`);
        return createEncryptedSnapshot(connection, target);
      },
      async exportPortable(exportOptions): Promise<PortableExportSummary> {
        return exportPortableDatabase({
          connection,
          databaseKey: keyText,
          schemaVersion,
          destination: exportOptions.destination,
          passphrase: exportOptions.passphrase,
          now
        });
      },
      close(): void {
        if (closed) {
          return;
        }

        closed = true;

        try {
          connection.close();
        } finally {
          keyBytes.fill(0);
          keyText = "";
        }
      }
    };
  } catch (error) {
    connection.close();
    resolvedKey.keyBytes.fill(0);

    if (!databaseExisted) {
      await removeIfExists(paths.databaseFile);
      await removeIfExists(`${paths.databaseFile}-wal`);
      await removeIfExists(`${paths.databaseFile}-shm`);
    }

    throw error;
  }
}

export async function openExistingDatabaseForSnapshot(
  options: OpenCompanionDatabaseOptions
): Promise<CompanionDatabase> {
  return openCompanionDatabase({ ...options, runMigrations: false });
}

export async function readDatabaseKeyForRestore(
  paths: StoragePaths,
  keyProtector: KeyProtector
): Promise<{ keyText: string; keyBytes: Buffer; manifest: KeyManifest }> {
  const manifest = await readKeyManifest(paths.keyManifestFile);
  const wrapped = await readFile(paths.wrappedKeyFile);
  let unwrapped: { key: Buffer; shouldReEncrypt: boolean };

  try {
    unwrapped = await keyProtector.unwrap(wrapped);
  } catch (error) {
    throw wrapStorageError(
      "key_unwrap_failed",
      "The existing database key could not be unlocked.",
      error
    );
  }

  const keyText = unwrapped.key.toString("utf8");

  if (!databaseKeyPattern.test(keyText)) {
    unwrapped.key.fill(0);
    throw new StorageError("key_unwrap_failed", "The unwrapped database key has an invalid shape.");
  }

  return { keyText, keyBytes: unwrapped.key, manifest };
}

export async function writeRestoredKey(
  paths: StoragePaths,
  keyText: string,
  keyProtector: KeyProtector,
  now: () => Date
): Promise<KeyManifest> {
  const wrapped = await keyProtector.wrap(Buffer.from(keyText, "utf8"));
  const manifest = createKeyManifest({
    keyId: randomUUID(),
    createdAt: now(),
    wrapMethod: keyProtector.id,
    protectorId: keyProtector.id
  });

  await writeFileAtomic(paths.wrappedKeyFile, wrapped);
  await writeKeyManifest(paths.keyManifestFile, manifest);
  return manifest;
}

export async function removeDatabaseFiles(databaseFile: string): Promise<void> {
  await removeIfExists(databaseFile);
  await removeIfExists(`${databaseFile}-wal`);
  await removeIfExists(`${databaseFile}-shm`);
  await rm(`${databaseFile}-journal`, { force: true });
}

