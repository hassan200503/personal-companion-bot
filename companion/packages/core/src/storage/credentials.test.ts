import { describe, expect, it } from "vitest";
import {
  KeytarCredentialStore,
  type KeytarLike,
  SafeStorageKeyProtector,
  type SafeStorageLike
} from "./index";
import { createTestLogger } from "./test-helpers";

const apiKey = "gsk-test-only-not-a-real-secret-0123456789";

class FakeKeytar implements KeytarLike {
  readonly entries = new Map<string, string>();
  fail = false;

  private key(service: string, account: string): string {
    return `${service}\u0000${account}`;
  }

  async getPassword(service: string, account: string): Promise<string | null> {
    if (this.fail) {
      throw new Error("Credential Manager is unavailable.");
    }

    return this.entries.get(this.key(service, account)) ?? null;
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    if (this.fail) {
      throw new Error("Credential Manager is unavailable.");
    }

    this.entries.set(this.key(service, account), password);
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    if (this.fail) {
      throw new Error("Credential Manager is unavailable.");
    }

    return this.entries.delete(this.key(service, account));
  }

  async findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
    if (this.fail) {
      throw new Error("Credential Manager is unavailable.");
    }

    const prefix = `${service}\u0000`;
    return [...this.entries.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, password]) => ({ account: key.slice(prefix.length), password }));
  }
}

class FakeSafeStorage implements SafeStorageLike {
  available = true;
  shouldReEncrypt = false;
  fail = false;

  isAsyncEncryptionAvailable(): boolean {
    return this.available;
  }

  async encryptStringAsync(plainText: string): Promise<Buffer> {
    if (this.fail) {
      throw new Error("DPAPI is unavailable.");
    }

    return Buffer.from(`SAFE:${plainText}`, "utf8");
  }

  async decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }> {
    if (this.fail) {
      throw new Error("DPAPI is unavailable.");
    }

    return {
      result: encrypted.toString("utf8").slice("SAFE:".length),
      shouldReEncrypt: this.shouldReEncrypt
    };
  }
}

describe("Windows credential adapter", () => {
  it("stores, reads, lists and deletes provider keys by id", async () => {
    const keytar = new FakeKeytar();
    const store = new KeytarCredentialStore({ keytar, service: "CompanionTest" });

    await store.set("groq", apiKey);
    expect(await store.get("groq")).toBe(apiKey);
    expect(await store.tryGet("groq")).toBe(apiKey);
    expect(await store.listProviderIds()).toEqual(["groq"]);

    keytar.entries.set("CompanionTest\u0000provider/ignored", "value");

    await store.delete("groq");
    expect(await store.tryGet("groq")).toBeNull();
    await expect(store.get("groq")).rejects.toMatchObject({ code: "credential_not_found" });
    await store.delete("groq");
  });

  it("rejects invalid provider ids and malformed keys", async () => {
    const store = new KeytarCredentialStore({ keytar: new FakeKeytar() });

    await expect(store.get("Groq Provider")).rejects.toMatchObject({
      code: "invalid_credential_id"
    });
    await expect(store.set("groq", "key with spaces")).rejects.toMatchObject({
      code: "invalid_api_key"
    });
    await expect(store.set("groq", "short")).rejects.toMatchObject({ code: "invalid_api_key" });
  });

  it("maps Credential Manager failures to typed errors without logging the key", async () => {
    const keytar = new FakeKeytar();
    const { logger, lines } = createTestLogger();
    const store = new KeytarCredentialStore({ keytar, logger });

    await store.set("groq", apiKey);
    await store.listProviderIds();
    keytar.fail = true;

    await expect(store.tryGet("groq")).rejects.toMatchObject({ code: "credential_unavailable" });
    await expect(store.set("groq", apiKey)).rejects.toMatchObject({
      code: "credential_write_failed"
    });
    await expect(store.listProviderIds()).rejects.toMatchObject({
      code: "credential_unavailable"
    });

    expect(lines.join("\n")).not.toContain(apiKey);
  });
});

describe("safeStorage key protector", () => {
  it("round-trips key material through the asynchronous API", async () => {
    const safeStorage = new FakeSafeStorage();
    safeStorage.shouldReEncrypt = true;
    const protector = new SafeStorageKeyProtector(safeStorage);
    const key = Buffer.from("database-key-material", "utf8");

    expect(await protector.isAvailable()).toBe(true);
    const wrapped = await protector.wrap(key);
    const unwrapped = await protector.unwrap(wrapped);

    expect(unwrapped.key).toEqual(key);
    expect(unwrapped.key.toString("utf8")).not.toContain("SAFE:");
    expect(unwrapped.shouldReEncrypt).toBe(true);
  });

  it("fails closed when DPAPI is unavailable", async () => {
    const safeStorage = new FakeSafeStorage();
    safeStorage.available = false;
    const protector = new SafeStorageKeyProtector(safeStorage);
    expect(await protector.isAvailable()).toBe(false);

    safeStorage.fail = true;

    await expect(protector.wrap(Buffer.from("key", "utf8"))).rejects.toMatchObject({
      code: "key_wrap_failed"
    });
    await expect(protector.unwrap(Buffer.from("wrapped", "utf8"))).rejects.toMatchObject({
      code: "key_unwrap_failed"
    });
  });
});
