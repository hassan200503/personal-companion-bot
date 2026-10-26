import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback
} from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { databaseCipher } from "./key-manifest";
import { ensurePrivateDir, writeFileAtomic } from "./atomic";
import { StorageError, wrapStorageError } from "./errors";
import { createEncryptedSnapshot } from "./snapshot";
import type { SqliteConnection } from "./types";

const magic = Buffer.from("COMPORT1", "ascii");
const containerVersion = 1;
const passwordEncoding = "utf8";
const minimumPassphraseLength = 12;
const maximumPassphraseLength = 1024;
const scryptParameters = {
  name: "scrypt",
  N: 131072,
  r: 8,
  p: 1,
  keyLength: 32,
  maxmem: 256 * 1024 * 1024
} as const;
const gcmNonceLength = 12;
const gcmTagLength = 16;
const maximumManifestLength = 1024 * 1024;
const maximumPlaintextHeaderLength = 64 * 1024;
const databaseKeyPattern = /^[A-Za-z0-9_-]{43}$/;

const scryptAsync = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const exportManifestSchema = z.object({
  formatVersion: z.literal(1),
  createdAt: z.string().min(1),
  appName: z.literal("companion"),
  schemaVersion: z.number().int().nonnegative(),
  databaseCipher: z.object({
    name: z.literal(databaseCipher.name),
    pageSize: z.literal(databaseCipher.pageSize),
    kdfIterations: z.literal(databaseCipher.kdfIterations)
  }),
  kdf: z.object({
    name: z.literal(scryptParameters.name),
    N: z.literal(scryptParameters.N),
    r: z.literal(scryptParameters.r),
    p: z.literal(scryptParameters.p),
    salt: z.string().min(1)
  }),
  nonce: z.string().min(1)
});

const plaintextHeaderSchema = z.object({
  formatVersion: z.literal(1),
  databaseKey: z.string().regex(databaseKeyPattern),
  schemaVersion: z.number().int().nonnegative(),
  databaseCipher: z.object({
    name: z.literal(databaseCipher.name),
    pageSize: z.literal(databaseCipher.pageSize),
    kdfIterations: z.literal(databaseCipher.kdfIterations)
  })
});

type ExportManifest = z.infer<typeof exportManifestSchema>;
type PlaintextHeader = z.infer<typeof plaintextHeaderSchema>;

export interface PortableExportSummary {
  path: string;
  bytes: number;
  createdAt: string;
  schemaVersion: number;
}

export interface ExportPortableOptions {
  connection: SqliteConnection;
  databaseKey: string;
  schemaVersion: number;
  destination: string;
  passphrase: string;
  now?: () => Date;
}

export interface DecryptedPortableExport {
  manifest: ExportManifest;
  plaintextHeader: PlaintextHeader;
  databaseBytes: Buffer;
}

export function assertValidPassphrase(passphrase: string): void {
  if (
    passphrase.length < minimumPassphraseLength ||
    passphrase.length > maximumPassphraseLength
  ) {
    throw new StorageError(
      "invalid_passphrase",
      `Use a passphrase between ${minimumPassphraseLength} and ${maximumPassphraseLength} characters.`
    );
  }
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function parseUint32(buffer: Buffer, offset: number): number {
  if (offset + 4 > buffer.length) {
    throw new StorageError("export_invalid_header", "The portable export header is truncated.");
  }

  return buffer.readUInt32BE(offset);
}

function buildHeader(manifestBytes: Buffer): Buffer {
  return Buffer.concat([magic, uint32(containerVersion), uint32(manifestBytes.length), manifestBytes]);
}

function deriveExportKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(Buffer.from(passphrase, passwordEncoding), salt, scryptParameters.keyLength, {
    N: scryptParameters.N,
    r: scryptParameters.r,
    p: scryptParameters.p,
    maxmem: scryptParameters.maxmem
  });
}

export async function exportPortableDatabase(
  options: ExportPortableOptions
): Promise<PortableExportSummary> {
  assertValidPassphrase(options.passphrase);
  await ensurePrivateDir(dirname(options.destination));

  const snapshotPath = `${options.destination}.snapshot-${process.pid}-${randomUUID()}`;
  let databaseBytes: Buffer;

  try {
    await createEncryptedSnapshot(options.connection, snapshotPath);
    databaseBytes = await readFile(snapshotPath);
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }

    throw wrapStorageError("export_failed", "The database snapshot could not be read.", error);
  } finally {
    await rm(snapshotPath, { force: true });
  }

  const createdAt = (options.now?.() ?? new Date()).toISOString();
  const plaintextHeader: PlaintextHeader = {
    formatVersion: 1,
    databaseKey: options.databaseKey,
    schemaVersion: options.schemaVersion,
    databaseCipher: {
      name: databaseCipher.name,
      pageSize: databaseCipher.pageSize,
      kdfIterations: databaseCipher.kdfIterations
    }
  };
  const plaintextHeaderBytes = Buffer.from(JSON.stringify(plaintextHeader), "utf8");
  const plaintext = Buffer.concat([
    uint32(plaintextHeaderBytes.length),
    plaintextHeaderBytes,
    databaseBytes
  ]);

  const salt = randomBytes(16);
  const nonce = randomBytes(gcmNonceLength);
  const manifest: ExportManifest = {
    formatVersion: 1,
    createdAt,
    appName: "companion",
    schemaVersion: options.schemaVersion,
    databaseCipher: {
      name: databaseCipher.name,
      pageSize: databaseCipher.pageSize,
      kdfIterations: databaseCipher.kdfIterations
    },
    kdf: {
      name: scryptParameters.name,
      N: scryptParameters.N,
      r: scryptParameters.r,
      p: scryptParameters.p,
      salt: salt.toString("base64")
    },
    nonce: nonce.toString("base64")
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  const header = buildHeader(manifestBytes);
  const key = await deriveExportKey(options.passphrase, salt);

  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(header);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const container = Buffer.concat([header, ciphertext, tag]);
    await writeFileAtomic(options.destination, container);

    return {
      path: options.destination,
      bytes: container.length,
      createdAt,
      schemaVersion: options.schemaVersion
    };
  } catch (error) {
    throw wrapStorageError("export_failed", "The portable export could not be written.", error);
  } finally {
    key.fill(0);
  }
}

export async function decryptPortableExport(
  exportPath: string,
  passphrase: string
): Promise<DecryptedPortableExport> {
  assertValidPassphrase(passphrase);

  let container: Buffer;

  try {
    container = await readFile(exportPath);
  } catch (error) {
    throw wrapStorageError("export_failed", "The portable export could not be read.", error);
  }

  if (container.length < magic.length + 8 + gcmTagLength) {
    throw new StorageError("export_invalid_header", "The portable export is too short to be valid.");
  }

  if (!container.subarray(0, magic.length).equals(magic)) {
    throw new StorageError("export_invalid_header", "The portable export has an unknown file signature.");
  }

  const version = parseUint32(container, magic.length);

  if (version !== containerVersion) {
    throw new StorageError(
      "export_incompatible",
      `The portable export format version ${version} is not supported.`
    );
  }

  const manifestLength = parseUint32(container, magic.length + 4);
  const headerLength = magic.length + 8 + manifestLength;
  const tagOffset = container.length - gcmTagLength;

  if (manifestLength > maximumManifestLength || headerLength + gcmTagLength > container.length) {
    throw new StorageError("export_invalid_header", "The portable export manifest length is invalid.");
  }

  const header = container.subarray(0, headerLength);
  const manifestBytes = container.subarray(magic.length + 8, headerLength);
  let manifestJson: unknown;

  try {
    manifestJson = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    throw wrapStorageError("export_invalid_header", "The portable export manifest is not valid JSON.", error);
  }

  const parsedManifest = exportManifestSchema.safeParse(manifestJson);

  if (!parsedManifest.success) {
    throw new StorageError("export_invalid_header", "The portable export manifest is not supported.", {
      cause: parsedManifest.error
    });
  }

  const manifest = parsedManifest.data;
  const salt = Buffer.from(manifest.kdf.salt, "base64");
  const nonce = Buffer.from(manifest.nonce, "base64");

  if (salt.length !== 16 || nonce.length !== gcmNonceLength) {
    throw new StorageError("export_invalid_header", "The portable export salt or nonce length is invalid.");
  }

  const key = await deriveExportKey(passphrase, salt);
  let plaintext: Buffer;

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(header);
    decipher.setAuthTag(container.subarray(tagOffset));
    plaintext = Buffer.concat([
      decipher.update(container.subarray(headerLength, tagOffset)),
      decipher.final()
    ]);
  } catch (error) {
    throw new StorageError(
      "export_auth_failed",
      "The portable export could not be decrypted. The passphrase is wrong or the file was modified.",
      { cause: error }
    );
  } finally {
    key.fill(0);
  }

  const plaintextHeaderLength = parseUint32(plaintext, 0);

  if (
    plaintextHeaderLength === 0 ||
    plaintextHeaderLength > maximumPlaintextHeaderLength ||
    plaintextHeaderLength + 4 > plaintext.length
  ) {
    throw new StorageError("export_invalid_header", "The portable export payload header is invalid.");
  }

  let plaintextHeaderJson: unknown;

  try {
    plaintextHeaderJson = JSON.parse(plaintext.subarray(4, 4 + plaintextHeaderLength).toString("utf8"));
  } catch (error) {
    throw wrapStorageError("export_invalid_header", "The portable export payload header is not valid JSON.", error);
  }

  const parsedHeader = plaintextHeaderSchema.safeParse(plaintextHeaderJson);

  if (!parsedHeader.success) {
    throw new StorageError("export_invalid_header", "The portable export payload header is not supported.", {
      cause: parsedHeader.error
    });
  }

  return {
    manifest,
    plaintextHeader: parsedHeader.data,
    databaseBytes: plaintext.subarray(4 + plaintextHeaderLength)
  };
}

