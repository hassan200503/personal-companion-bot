import { createHash } from "node:crypto";
import { StorageError, wrapStorageError } from "./errors";
import type { SqliteConnection } from "./types";

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
}

const initialSchemaUp = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  provider_id TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('drafted', 'confirmed', 'initiated', 'completed', 'failed', 'unknown'))
);

CREATE INDEX messages_conversation_created_idx
  ON messages (conversation_id, created_at);

CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content = 'messages',
  content_rowid = 'rowid',
  tokenize = 'unicode61'
);

CREATE TRIGGER messages_after_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts (rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER messages_after_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts (messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER messages_after_update AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts (messages_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO messages_fts (rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  origin TEXT NOT NULL CHECK (origin IN ('explicit', 'inferred', 'imported')),
  source_type TEXT,
  source_reference TEXT,
  confidence REAL NOT NULL DEFAULT 1,
  sensitivity TEXT NOT NULL DEFAULT 'normal'
    CHECK (sensitivity IN ('normal', 'personal', 'sensitive', 'secret')),
  approval TEXT NOT NULL DEFAULT 'proposed'
    CHECK (approval IN ('proposed', 'approved', 'rejected')),
  retention_policy TEXT NOT NULL DEFAULT 'owner-managed',
  expires_at TEXT,
  embedding_ref TEXT,
  supersedes_id TEXT REFERENCES memories(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  last_confirmed_at TEXT
);

CREATE INDEX memories_approval_category_idx ON memories (approval, category);
CREATE INDEX memories_supersedes_idx ON memories (supersedes_id);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  content,
  content = 'memories',
  content_rowid = 'rowid',
  tokenize = 'unicode61'
);

CREATE TRIGGER memories_after_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts (rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER memories_after_delete AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts (memories_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER memories_after_update AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts (memories_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO memories_fts (rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX audit_log_created_idx ON audit_log (created_at);
`;

const initialSchemaDown = `
DROP TRIGGER memories_after_update;
DROP TRIGGER memories_after_delete;
DROP TRIGGER memories_after_insert;
DROP TABLE memories_fts;
DROP INDEX memories_supersedes_idx;
DROP INDEX memories_approval_category_idx;
DROP TABLE memories;

DROP TRIGGER messages_after_update;
DROP TRIGGER messages_after_delete;
DROP TRIGGER messages_after_insert;
DROP TABLE messages_fts;
DROP INDEX messages_conversation_created_idx;
DROP TABLE messages;

DROP TABLE conversations;
DROP TABLE settings;
DROP TABLE audit_log;
`;

export const migrationList: readonly Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up: initialSchemaUp,
    down: initialSchemaDown
  }
];

const migrationTableSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`;

export function migrationChecksum(migration: Migration): string {
  return createHash("sha256")
    .update(migration.up)
    .update("\n--DOWN--\n")
    .update(migration.down)
    .digest("hex");
}

export function validateMigrationSet(migrations: readonly Migration[]): void {
  if (migrations.length === 0) {
    throw new StorageError("schema_incompatible", "The migration list is empty.");
  }

  let previous = 0;

  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previous) {
      throw new StorageError("schema_incompatible", "Migrations are not ordered by unique ascending version.");
    }

    if (migration.name.trim().length === 0) {
      throw new StorageError("schema_incompatible", `Migration ${migration.version} has no name.`);
    }

    previous = migration.version;
  }
}

export function ensureMigrationTable(connection: SqliteConnection): void {
  connection.exec(migrationTableSql);
}

export function readAppliedMigrations(connection: SqliteConnection): AppliedMigration[] {
  return connection
    .prepare("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version")
    .all() as AppliedMigration[];
}

function assertKnownAndUnmodified(
  applied: readonly AppliedMigration[],
  migrations: readonly Migration[]
): void {
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]));

  for (const row of applied) {
    const migration = byVersion.get(row.version);

    if (migration === undefined) {
      throw new StorageError(
        "schema_incompatible",
        `The database contains migration ${row.version}, which this app version does not know.`
      );
    }

    const expected = migrationChecksum(migration);

    if (expected !== row.checksum) {
      throw new StorageError(
        "migration_checksum_mismatch",
        `Migration ${row.version} (${row.name}) does not match the recorded checksum.`
      );
    }
  }
}

export function currentSchemaVersion(connection: SqliteConnection): number {
  const row = connection
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
    .get() as { version: number };
  return row.version;
}

export function migrateUp(
  connection: SqliteConnection,
  migrations: readonly Migration[],
  now: () => Date = () => new Date()
): number {
  validateMigrationSet(migrations);
  ensureMigrationTable(connection);
  const applied = readAppliedMigrations(connection);
  assertKnownAndUnmodified(applied, migrations);

  const userVersion = connection.pragma("user_version", { simple: true }) as number;
  const appliedVersion = currentSchemaVersion(connection);
  const latest = migrations[migrations.length - 1]?.version ?? 0;

  if (userVersion !== appliedVersion) {
    throw new StorageError(
      "schema_incompatible",
      `PRAGMA user_version (${userVersion}) does not match the migration table (${appliedVersion}).`
    );
  }

  if (userVersion > latest) {
    throw new StorageError(
      "schema_incompatible",
      `The database schema is newer (${userVersion}) than this app supports (${latest}).`
    );
  }

  for (const migration of migrations) {
    if (migration.version <= appliedVersion) {
      continue;
    }

    const apply = connection.transaction(() => {
      connection.exec(migration.up);
      connection
        .prepare(
          "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)"
        )
        .run(migration.version, migration.name, migrationChecksum(migration), now().toISOString());
      connection.pragma(`user_version = ${migration.version}`);
    });

    try {
      apply.immediate();
    } catch (error) {
      throw wrapStorageError(
        "migration_failed",
        `Migration ${migration.version} (${migration.name}) failed and was rolled back.`,
        error
      );
    }
  }

  return currentSchemaVersion(connection);
}

export function migrateDown(
  connection: SqliteConnection,
  targetVersion: number,
  migrations: readonly Migration[]
): number {
  validateMigrationSet(migrations);
  ensureMigrationTable(connection);
  const applied = readAppliedMigrations(connection);
  assertKnownAndUnmodified(applied, migrations);

  if (!Number.isInteger(targetVersion) || targetVersion < 0) {
    throw new StorageError("schema_incompatible", "The target migration version is invalid.");
  }

  const current = currentSchemaVersion(connection);

  if (targetVersion > current) {
    throw new StorageError(
      "schema_incompatible",
      `Cannot migrate down from ${current} to the newer version ${targetVersion}.`
    );
  }

  const ordered = [...migrations].sort((left, right) => right.version - left.version);
  const previousVersionFor = (version: number): number =>
    migrations.filter((migration) => migration.version < version).at(-1)?.version ?? 0;

  for (const migration of ordered) {
    if (migration.version <= targetVersion || migration.version > current) {
      continue;
    }

    const revert = connection.transaction(() => {
      connection.exec(migration.down);
      connection.prepare("DELETE FROM schema_migrations WHERE version = ?").run(migration.version);
      connection.pragma(`user_version = ${previousVersionFor(migration.version)}`);
    });

    try {
      revert.immediate();
    } catch (error) {
      throw wrapStorageError(
        "migration_failed",
        `Rollback of migration ${migration.version} (${migration.name}) failed.`,
        error
      );
    }
  }

  return currentSchemaVersion(connection);
}

