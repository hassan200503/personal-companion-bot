export {
  isStorageError,
  storageErrorCodes,
  StorageError,
  wrapStorageError
} from "./errors";
export type { StorageErrorCode, StorageErrorOptions } from "./errors";
export type { Clock, CredentialStore, KeyProtector, StorageLogger, StoragePaths } from "./contracts";
export { ensurePrivateDir, removeIfExists, sqlStringLiteral, toFilesystemTimestamp, writeFileAtomic } from "./atomic";
export {
  buildStoragePaths,
  openCompanionDatabase,
  openEncryptedConnection,
  openExistingDatabaseForSnapshot,
  readDatabaseKeyForRestore,
  removeDatabaseFiles,
  verifyDatabaseCipherParameters,
  writeRestoredKey
} from "./database";
export type { CompanionDatabase, OpenCompanionDatabaseOptions } from "./database";
export {
  createKeyManifest,
  databaseCipher,
  readKeyManifest,
  writeKeyManifest
} from "./key-manifest";
export type { CreateKeyManifestOptions, KeyManifest } from "./key-manifest";
export {
  currentSchemaVersion,
  ensureMigrationTable,
  migrateDown,
  migrateUp,
  migrationChecksum,
  migrationList,
  readAppliedMigrations,
  validateMigrationSet
} from "./migrations";
export type { AppliedMigration, Migration } from "./migrations";
export { createEncryptedSnapshot } from "./snapshot";
export {
  assertValidPassphrase,
  decryptPortableExport,
  exportPortableDatabase
} from "./portable-export";
export type {
  DecryptedPortableExport,
  ExportPortableOptions,
  PortableExportSummary
} from "./portable-export";
export { restorePortableDatabase } from "./restore";
export type { RestorePortableOptions, RestorePortableResult } from "./restore";
export { KeytarCredentialStore } from "./credentials";
export type { KeytarCredentialStoreOptions, KeytarLike } from "./credentials";
export { SafeStorageKeyProtector } from "./key-protection";
export type { SafeStorageLike } from "./key-protection";
export type { SqliteConnection } from "./types";
