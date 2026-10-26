import type { KeyProtector } from "./contracts";
import { StorageError, wrapStorageError } from "./errors";

export interface SafeStorageLike {
  isAsyncEncryptionAvailable(): boolean | Promise<boolean>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

export class SafeStorageKeyProtector implements KeyProtector {
  readonly id = "electron-safe-storage";
  private readonly safeStorage: SafeStorageLike;

  constructor(safeStorage: SafeStorageLike) {
    this.safeStorage = safeStorage;
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await this.safeStorage.isAsyncEncryptionAvailable();
    } catch {
      return false;
    }
  }

  async wrap(plaintext: Buffer): Promise<Buffer> {
    try {
      return await this.safeStorage.encryptStringAsync(plaintext.toString("base64"));
    } catch (error) {
      throw wrapStorageError(
        "key_wrap_failed",
        "Windows could not protect the database key.",
        error
      );
    }
  }

  async unwrap(wrapped: Buffer): Promise<{ key: Buffer; shouldReEncrypt: boolean }> {
    let result: { result: string; shouldReEncrypt: boolean };

    try {
      result = await this.safeStorage.decryptStringAsync(wrapped);
    } catch (error) {
      throw wrapStorageError(
        "key_unwrap_failed",
        "Windows could not unlock the database key for this user.",
        error
      );
    }

    const key = Buffer.from(result.result, "base64");

    if (key.length === 0) {
      throw new StorageError("key_unwrap_failed", "The unwrapped database key is empty.");
    }

    return { key, shouldReEncrypt: result.shouldReEncrypt };
  }
}
