import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, type Logger } from "../logger";
import type { KeyProtector, StoragePaths } from "./contracts";
import type { CompanionDatabase } from "./database";

const wrapPrefix = "FAKE-WRAP:";

export interface FakeKeyProtectorOptions {
  available?: boolean;
  shouldReEncrypt?: boolean;
  failUnwrap?: boolean;
}

export class FakeKeyProtector implements KeyProtector {
  readonly id = "test-key-protector";
  available: boolean;
  shouldReEncrypt: boolean;
  failUnwrap: boolean;
  lastKeyText: string | null = null;
  wrapCount = 0;

  constructor(options: FakeKeyProtectorOptions = {}) {
    this.available = options.available ?? true;
    this.shouldReEncrypt = options.shouldReEncrypt ?? false;
    this.failUnwrap = options.failUnwrap ?? false;
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async wrap(plaintext: Buffer): Promise<Buffer> {
    this.wrapCount += 1;
    this.lastKeyText = plaintext.toString("utf8");
    return Buffer.from(`${wrapPrefix}${plaintext.toString("base64")}`, "utf8");
  }

  async unwrap(wrapped: Buffer): Promise<{ key: Buffer; shouldReEncrypt: boolean }> {
    if (this.failUnwrap) {
      throw new Error("The fake key protector is unavailable.");
    }

    const text = wrapped.toString("utf8");

    if (!text.startsWith(wrapPrefix)) {
      throw new Error("The fake key protector received an unknown payload.");
    }

    const key = Buffer.from(text.slice(wrapPrefix.length), "base64");
    this.lastKeyText = key.toString("utf8");
    return { key, shouldReEncrypt: this.shouldReEncrypt };
  }
}

export function createTestLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  const logger = createLogger({ level: "debug", sink: (line) => lines.push(line) });
  return { logger, lines };
}

export async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "companion-storage-test-"));
}

export async function removeTempDir(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}

export function seedConversation(database: CompanionDatabase, marker: string): void {
  const now = new Date().toISOString();
  database.raw
    .prepare("INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run("conversation-1", "Test conversation", now, now);
  database.raw
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run("message-1", "conversation-1", "user", marker, now);
}

export function seedMemory(database: CompanionDatabase, marker: string): void {
  const now = new Date().toISOString();
  database.raw
    .prepare(
      `INSERT INTO memories
        (id, category, content, origin, sensitivity, approval, created_at, last_observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run("memory-1", "semantic", marker, "explicit", "normal", "approved", now, now);
}

export function fileNames(paths: StoragePaths): string[] {
  return [
    paths.databaseFile,
    `${paths.databaseFile}-wal`,
    `${paths.databaseFile}-shm`,
    paths.wrappedKeyFile,
    paths.keyManifestFile
  ];
}
