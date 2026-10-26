import type { Logger } from "../logger";
import type { CredentialStore } from "./contracts";
import { StorageError, wrapStorageError } from "./errors";

export interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

const providerIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const accountPrefix = "provider/";
const minimumApiKeyLength = 8;
const maximumApiKeyLength = 512;

export interface KeytarCredentialStoreOptions {
  keytar: KeytarLike;
  service?: string;
  logger?: Logger;
}

export class KeytarCredentialStore implements CredentialStore {
  private readonly keytar: KeytarLike;
  private readonly service: string;
  private readonly logger?: Logger;

  constructor(options: KeytarCredentialStoreOptions) {
    this.keytar = options.keytar;
    this.service = options.service ?? "Companion";
    this.logger = options.logger;
  }

  private accountFor(providerId: string): string {
    if (!providerIdPattern.test(providerId)) {
      throw new StorageError(
        "invalid_credential_id",
        "The provider id is not valid for credential storage."
      );
    }

    return `${accountPrefix}${providerId}`;
  }

  private assertApiKey(apiKey: string): void {
    if (
      apiKey.length < minimumApiKeyLength ||
      apiKey.length > maximumApiKeyLength ||
      apiKey.trim() !== apiKey ||
      /\s/.test(apiKey)
    ) {
      throw new StorageError(
        "invalid_api_key",
        "The API key is empty, too long, or contains whitespace."
      );
    }
  }

  async get(providerId: string): Promise<string> {
    const value = await this.tryGet(providerId);

    if (value === null) {
      throw new StorageError(
        "credential_not_found",
        `No API key is stored for provider ${providerId}.`
      );
    }

    return value;
  }

  async tryGet(providerId: string): Promise<string | null> {
    const account = this.accountFor(providerId);
    let value: string | null;

    try {
      value = await this.keytar.getPassword(this.service, account);
    } catch (error) {
      throw wrapStorageError(
        "credential_unavailable",
        "Windows Credential Manager is not available.",
        error
      );
    }

    return value === null || value.length === 0 ? null : value;
  }

  async set(providerId: string, apiKey: string): Promise<void> {
    const account = this.accountFor(providerId);
    this.assertApiKey(apiKey);

    try {
      await this.keytar.setPassword(this.service, account, apiKey);
    } catch (error) {
      throw wrapStorageError(
        "credential_write_failed",
        "The API key could not be saved in Windows Credential Manager.",
        error
      );
    }
  }

  async delete(providerId: string): Promise<void> {
    const account = this.accountFor(providerId);

    try {
      await this.keytar.deletePassword(this.service, account);
    } catch (error) {
      throw wrapStorageError(
        "credential_unavailable",
        "The API key could not be deleted from Windows Credential Manager.",
        error
      );
    }
  }

  async listProviderIds(): Promise<string[]> {
    let entries: Array<{ account: string; password: string }>;

    try {
      entries = await this.keytar.findCredentials(this.service);
    } catch (error) {
      throw wrapStorageError(
        "credential_unavailable",
        "Windows Credential Manager could not be read.",
        error
      );
    }

    const ids = new Set<string>();

    for (const entry of entries) {
      if (!entry.account.startsWith(accountPrefix)) {
        continue;
      }

      const providerId = entry.account.slice(accountPrefix.length);

      if (providerIdPattern.test(providerId)) {
        ids.add(providerId);
      }
    }

    if (entries.length > 0) {
      this.logger?.debug("credential entries enumerated", {
        total: entries.length,
        companionProviders: ids.size
      });
    }

    return [...ids].sort();
  }
}
