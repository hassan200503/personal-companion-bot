# ADR-0002: Encrypted storage and key protection

- Status: Proposed, awaiting owner approval at G2
- Date: 2026-10-25
- Deciders: owner
- Author: implementation agent
- Related: `docs/MASTER_PROMPT.md` sections 5, 11, 13 and 14; `docs/DECISIONS/ADR-0001-stack.md`; `docs/VERIFICATION_LOG.md` D-01 to D-06

## Context

M2 must deliver versioned migrations, an encrypted database, a credential-storage adapter, backup and restore, and proof that data survives a restart without exposing keys. G2 requires the owner to approve the encryption design and key-protection approach before storage code is written.

The companion is a single-user Windows application. It is not a server and has no multi-user recovery service. The threat model must distinguish offline disk theft, another Windows user, and malware running as the same user. DPAPI and Windows Credential Manager protect against other users and raise the bar for casual offline disk access, but not against an offline attacker who can recover the Windows account password, and not against malware running as the same user.

This ADR proposes a concrete design but has not installed the native packages, created a database, or stored a key. The prototype gates at the end must pass before M2 implementation. No paid SQLCipher licence, certificate, or service is proposed.

## Decision proposed

### 1. One SQLCipher-format database

Use one local SQLite database encrypted with a SQLCipher-compatible codec through `better-sqlite3-multiple-ciphers` 13.0.3:

- MIT-licensed Node-API package with prebuilt Windows x64 and arm64 binaries for Electron 35 and later (D-03).
- `PRAGMA cipher = 'sqlcipher'` uses the modern SQLCipher-compatible mode, not `legacy = 4`. Defaults are PBKDF2-HMAC-SHA512 with 256,000 iterations, AES-256-CBC, and HMAC-SHA512; pin these parameters in code and verify them in a test.
- Keep FTS5 in the same encrypted database. The database pages and FTS5 shadow tables are encrypted at rest; no plaintext search index is created.
- Set `PRAGMA temp_store = MEMORY` because the bundled SQLite3MultipleCiphers 2.4.0 predates its 2.6.0 encrypted-temp-file work (D-02). Prototype WAL and temp behaviour.
- Use `journal_mode = WAL`, `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout = 5000`, and `cipher_memory_security = ON` if the build supports it. Do not enable SQLite's `verbose` SQL logging.
- Open the database only in the Electron main process. Keep the synchronous better-sqlite3 calls behind the storage adapter; move long maintenance work to a worker if measured UI latency requires it.

This is an independent SQLCipher-format implementation under SQLite3MultipleCiphers, not Zetetic's official SQLCipher library. The product must describe it as "SQLCipher-compatible encryption" and must not imply Zetetic support. The MIT notices stay in the app's open-source notices.

### 2. Database key hierarchy

- On first run, generate a random 256-bit database key (DEK) with Node's CSPRNG.
- Encode it as base64url and wrap it with Electron `safeStorage.encryptStringAsync`, which uses DPAPI in the logged-on user's scope (D-04). Do not use the deprecated synchronous API.
- Store only the DPAPI-wrapped bytes in `keys/db-key.bin`. Store a separate `keys/db-key.json` manifest with schema version, key id, creation time, cipher name, KDF parameters, page size, and wrap method. The manifest never contains the key.
- On unlock, decrypt the DEK and pass it to the database connection; do not write an unwrapped key to disk, config, logs, crash reports, or a backup manifest.
- If DPAPI or `safeStorage` is unavailable, fail closed with a clear storage-unavailable error. Never fall back to an unencrypted database.
- If `decryptStringAsync` returns `shouldReEncrypt = true`, rewrap the DEK and replace the wrapped blob atomically.
- Use versioned key ids so a future rotation can open the old database, rekey it to a new DEK, and only then delete the old wrapped key.
- Minimise key lifetime in JavaScript. Use `Buffer` where the native API allows it, clear buffers after use, and record that JavaScript strings and garbage-collected memory cannot be guaranteed to be zeroized.

The local data layout is under `app.getPath("userData")`:

```text
data/companion.db          SQLCipher-format database
data/companion.db-wal      encrypted WAL, if present
data/companion.db-shm      shared-memory file
keys/db-key.bin            DPAPI-wrapped DEK
keys/db-key.json           non-secret key manifest
backups/                   local encrypted snapshots and portable exports
```

### 3. Provider keys in Windows Credential Manager

Provider API keys are separate from the database key and are stored only in Windows Credential Manager generic credentials:

- First choice: `@github/keytar` 7.10.6, the maintained MIT fork of the archived `atom/node-keytar` (D-05). It uses Credential Vault on Windows.
- If its Electron 45 ABI or packaging fails the prototype, implement the same adapter directly against `CredWriteW`, `CredReadW`, `CredDeleteW`, and `CredEnumerateW` through a small Node-API addon. This is an implementation fallback, not a change to the G2 design.
- Use service `Companion` and account `provider/<providerId>`. Never put a provider key in SQLite, JSON config, logs, exports, backups, crash reports, or test fixtures.
- The adapter exposes `get`, `set`, `delete`, and `list` by provider id. Missing credentials return a typed `credential_not_found`; a broken Credential Manager returns `credential_unavailable`. There is no plaintext fallback.
- Provider keys are never exported. After a restore, the owner re-enters them. Deleting a provider or all data must delete the matching Credential Manager entries and verify that a read now fails.
- The UI never displays a saved key. Key-prefix hints are warnings only.

### 4. Schema and migrations

- A `schema_migrations` table records version, name, checksum, and application timestamp. `PRAGMA user_version` mirrors the latest version for a fast sanity check.
- Migration files are bundled, ordered, and run inside `BEGIN IMMEDIATE` transactions. A migration that fails rolls back and leaves the prior version intact.
- Every migration has an up path and a down path where SQLite allows it. Tests must apply all migrations to an empty database and roll back a migration in a disposable copy.
- Before a production migration, create a local encrypted snapshot with the SQLite backup API. If the snapshot or migration fails, stop and leave the original database untouched.
- Initial tables are expected to include `schema_migrations`, `settings`, `conversations`, `messages`, `memories`, and `audit_log`. Provider keys are not in any table. The M6 and M7 schemas extend this set behind versioned migrations rather than editing the initial migration in place.
- Audit rows are append-only through the application API. A database owner can still edit a file on disk; the privacy centre and future tamper evidence are separate controls.

### 5. Backup, export and recovery

Two different things are needed:

1. A local snapshot for crash and migration recovery. It is the same encrypted database under the same DPAPI-wrapped key, so it protects against database corruption but not loss of the Windows profile.
2. A portable, owner-initiated export. It must be readable after a profile loss or on a new PC, so it uses a user-supplied passphrase rather than DPAPI.

The portable export is proposed as:

- Make a consistent snapshot with better-sqlite3's backup API.
- Build a payload containing the encrypted database snapshot, its database key, and a versioned manifest. The database key is inside the encrypted envelope because a new machine has no DPAPI key for this app.
- Derive an export key from the passphrase with Node's built-in `crypto.scrypt` using N=2^17, r=8, p=1, a random 16-byte salt, a 32-byte output, and `maxmem` large enough for the parameters. Encrypt with AES-256-GCM using a random 12-byte nonce. Authenticate the header and payload; reject tampering.
- Exclude provider keys, logs, and crash data. The manifest records the schema version, database cipher parameters, KDF parameters, salt, nonce, and creation time.
- On restore, decrypt to a staging file, verify the database opens and its key is correct, generate a new local DEK, rekey the restored database to that DEK, wrap the new DEK with the current machine's DPAPI, and only then replace the active database. Keep a pre-restore snapshot.
- Restore requires explicit owner confirmation. Replacing an existing profile is destructive and must follow G5; tests use disposable directories.

There is no automatic key escrow and no recovery service. If the Windows profile is lost and the owner has no portable export, the database is unrecoverable. That is an explicit consequence of avoiding a hosted recovery service.

### 6. Failure behaviour

- Wrong key, not-a-database, corrupt header, or authentication failure: show a storage error, offer retry, portable restore, and an explicitly confirmed reset. Do not silently delete data or create a second plaintext database.
- Missing key file: do not regenerate over an existing database. Offer restore or confirmed reset.
- Missing database with a key present: create a new empty database only after confirming that no data file was expected; otherwise treat it as possible data loss.
- Credential Manager unavailable: memory and notes still work; provider setup is disabled with a clear error.
- Backup passphrase lost: the export cannot be recovered. State this before export.
- An interrupted rekey or restore leaves the original file and snapshot intact; use atomic rename and keep the old file until the new one opens successfully.

## Rejected alternatives

- **`node:sqlite` alone.** No encryption at rest; WAL, temp files, and FTS would expose content. Rejected.
- **BitLocker or EFS as the only control.** Useful defence in depth, but not per-application, not portable, and not sufficient for backups or another-user scenarios. Rejected as the primary control.
- **Application-level field encryption only.** FTS5 and indexes leak structure, every query needs custom crypto, and mistakes are easy. Rejected as the primary control.
- **Official SQLCipher Community Edition with a custom addon.** It is a valid, official option under the BSD-style licence, but requires building and packaging the C library and OpenSSL for Electron, and the app must ship the Zetetic notices. Kept as a fallback only if the MIT package fails its gates; it would need a revised ADR and possibly G4 if the Commercial Edition were chosen.
- **Default sqleet/ChaCha20-Poly1305 mode.** It is a reasonable equivalent, but the master prompt names SQLCipher, so the SQLCipher-compatible mode is easier to review and migrate.
- **Provider keys in a `safeStorage` file.** `safeStorage` is DPAPI-backed, but the master prompt explicitly requires Windows credential storage and excludes keys from config. Rejected.
- **Archived `atom/node-keytar`.** Archived upstream; use the maintained `@github/keytar` or a small native adapter instead.
- **Automatic recovery key escrow or cloud backup.** No hosted backend is allowed and it expands the threat surface. Rejected for v1.

## Consequences

Positive:

- One encrypted database covers conversations, memory, FTS5, settings, and audit data.
- The database key is random, not a user password, and is protected by the Windows user profile.
- Provider keys never enter the database or exports.
- A portable passphrase backup provides a real recovery path without a hosted service.
- The storage adapter can be tested with fake key and credential providers; Windows integration is a thin layer.

Negative:

- Native modules add build and packaging work, especially pruning prebuilt binaries and unpacking the `.node` file from ASAR.
- `@github/keytar` needs an Electron 45 ABI/packaging prototype; a custom N-API adapter is the fallback.
- DPAPI and Credential Manager do not protect against malware or an attacker running as the same user, and DPAPI is not a guarantee against an offline attacker who can recover the Windows account password. BitLocker and OS hardening remain recommendations, not guarantees.
- Losing the Windows profile without a portable export loses the data. The UI must make this clear.
- JavaScript cannot guarantee memory zeroization; key material may remain in process memory until garbage collection.
- SQLCipher-compatible mode is not official Zetetic SQLCipher and must not be described as such.
- The native package is maintained by one person; pin versions, review releases, and keep the official SQLCipher build as a fallback.

## Prototype gates before M2 implementation

The following must be proven on Windows with Electron 45 before storage code is merged:

1. `better-sqlite3-multiple-ciphers` 13.0.3 loads in the Electron main process and in Node 22 tests.
2. A database created with `PRAGMA cipher='sqlcipher'` and a random key reopens after restart; a wrong key fails; raw file bytes and WAL do not contain a known plaintext marker.
3. FTS5 can be created and queried on the encrypted database.
4. WAL, `temp_store=MEMORY`, backup, `VACUUM INTO` if used, and portable export/restore behaviour are measured and recorded.
5. electron-builder packages the correct Windows x64 `.node` binary, unpacks it from ASAR, and excludes unused platform binaries; the packaged app opens the database.
6. `@github/keytar` 7.10.6 can write, read, list, and delete a disposable generic credential under Electron 45; if not, the minimal `CredWriteW` adapter is prototyped.
7. The unwrapped database key is never present in logs, config, exports outside the encrypted envelope, or a raw string search of the data directory; the database key file is DPAPI-wrapped.
8. A test proves encrypted persistence across a process restart and a test proves a failed migration leaves the original database openable.

If any gate fails, stop and record the evidence. Do not silently switch to plaintext, a commercial licence, or a paid service.

## G2 questions for the owner

1. Approve the SQLCipher-compatible `better-sqlite3-multiple-ciphers` 13.0.3 approach, including the native packaging work and the official-SQLCipher fallback?
2. Approve the key hierarchy: random DEK wrapped by async Electron `safeStorage`/DPAPI, provider keys in Windows Credential Manager, no plaintext fallback, and no automatic escrow?
3. Approve portable passphrase backups using scrypt and AES-256-GCM, excluding provider keys, with restore rekeying to a fresh local key and requiring explicit confirmation?
4. Approve the prototype gates and the rule that a failed gate stops M2 with evidence rather than silently changing the design?

If the owner prefers a different backup/recovery model (for example a printed recovery key or no portable backup in v1), that must be decided before M2 implementation.
