import { randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type BetterSqlite3 from "better-sqlite3-multiple-ciphers";
import { ensurePrivateDir, sqlStringLiteral } from "./atomic";
import { wrapStorageError } from "./errors";

export async function createEncryptedSnapshot(
  connection: BetterSqlite3.Database,
  destination: string
): Promise<string> {
  await ensurePrivateDir(dirname(destination));
  const temporaryPath = `${destination}.tmp-${process.pid}-${randomUUID()}`;

  await rm(temporaryPath, { force: true });

  try {
    connection.exec(`VACUUM INTO ${sqlStringLiteral(temporaryPath)}`);
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw wrapStorageError("snapshot_failed", "The encrypted snapshot could not be created.", error);
  }

  return destination;
}
