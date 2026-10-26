import { readFile } from "node:fs/promises";
import { z } from "zod";
import { writeFileAtomic } from "./atomic";
import { StorageError, wrapStorageError } from "./errors";

export const databaseCipher = {
  name: "sqlcipher",
  pageSize: 4096,
  kdfIterations: 256000
} as const;

const keyManifestSchema = z.object({
  schemaVersion: z.literal(1),
  keyId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  createdAt: z.string().min(1),
  cipher: z.literal(databaseCipher.name),
  pageSize: z.literal(databaseCipher.pageSize),
  kdf: z.object({
    name: z.literal("pbkdf2-hmac-sha512"),
    iterations: z.literal(databaseCipher.kdfIterations)
  }),
  wrap: z.object({
    method: z.string().min(1),
    protectorId: z.string().min(1)
  })
});

export type KeyManifest = z.infer<typeof keyManifestSchema>;

export interface CreateKeyManifestOptions {
  keyId: string;
  createdAt: Date;
  wrapMethod: string;
  protectorId: string;
}

export function createKeyManifest(options: CreateKeyManifestOptions): KeyManifest {
  return {
    schemaVersion: 1,
    keyId: options.keyId,
    createdAt: options.createdAt.toISOString(),
    cipher: databaseCipher.name,
    pageSize: databaseCipher.pageSize,
    kdf: {
      name: "pbkdf2-hmac-sha512",
      iterations: databaseCipher.kdfIterations
    },
    wrap: {
      method: options.wrapMethod,
      protectorId: options.protectorId
    }
  };
}

export async function readKeyManifest(filePath: string): Promise<KeyManifest> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw wrapStorageError("key_manifest_invalid", "The database key manifest could not be read.", error);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw wrapStorageError("key_manifest_invalid", "The database key manifest is not valid JSON.", error);
  }

  const result = keyManifestSchema.safeParse(parsed);

  if (!result.success) {
    throw new StorageError("key_manifest_invalid", "The database key manifest does not match the supported format.", {
      cause: result.error
    });
  }

  if (Number.isNaN(Date.parse(result.data.createdAt))) {
    throw new StorageError("key_manifest_invalid", "The database key manifest has an invalid creation time.");
  }

  return result.data;
}

export async function writeKeyManifest(filePath: string, manifest: KeyManifest): Promise<void> {
  await writeFileAtomic(filePath, `${JSON.stringify(manifest, null, 2)}\n`);
}
