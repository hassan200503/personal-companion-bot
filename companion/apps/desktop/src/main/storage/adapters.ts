import { safeStorage } from "electron";
import * as keytar from "@github/keytar";
import {
  KeytarCredentialStore,
  SafeStorageKeyProtector,
  type Logger
} from "@companion/core";

export function createDesktopKeyProtector(): SafeStorageKeyProtector {
  return new SafeStorageKeyProtector({
    isAsyncEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
    encryptStringAsync: (plainText) => safeStorage.encryptStringAsync(plainText),
    decryptStringAsync: (encrypted) => safeStorage.decryptStringAsync(encrypted)
  });
}

export function createDesktopCredentialStore(logger?: Logger): KeytarCredentialStore {
  return new KeytarCredentialStore({
    keytar,
    service: "Companion",
    ...(logger === undefined ? {} : { logger })
  });
}
