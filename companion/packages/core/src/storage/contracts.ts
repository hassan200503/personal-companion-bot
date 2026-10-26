import type { Logger } from "../logger";

export interface KeyProtector {
  readonly id: string;
  isAvailable(): Promise<boolean>;
  wrap(plaintext: Buffer): Promise<Buffer>;
  unwrap(wrapped: Buffer): Promise<{ key: Buffer; shouldReEncrypt: boolean }>;
}

export interface CredentialStore {
  get(providerId: string): Promise<string>;
  tryGet(providerId: string): Promise<string | null>;
  set(providerId: string, apiKey: string): Promise<void>;
  delete(providerId: string): Promise<void>;
  listProviderIds(): Promise<string[]>;
}

export interface StoragePaths {
  rootDir: string;
  dataDir: string;
  keyDir: string;
  backupDir: string;
  databaseFile: string;
  wrappedKeyFile: string;
  keyManifestFile: string;
}

export interface StorageLogger {
  logger?: Logger;
}

export interface Clock {
  now(): Date;
}
