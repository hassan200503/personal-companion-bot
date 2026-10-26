export const storageErrorCodes = [
  "storage_unavailable",
  "key_protector_unavailable",
  "key_missing",
  "key_manifest_invalid",
  "key_unwrap_failed",
  "key_wrap_failed",
  "database_unreadable",
  "database_open_failed",
  "schema_incompatible",
  "migration_checksum_mismatch",
  "migration_failed",
  "migration_snapshot_failed",
  "snapshot_failed",
  "export_failed",
  "export_invalid_header",
  "export_auth_failed",
  "export_incompatible",
  "restore_failed",
  "credential_not_found",
  "credential_unavailable",
  "credential_write_failed",
  "invalid_credential_id",
  "invalid_api_key",
  "invalid_passphrase"
] as const;

export type StorageErrorCode = (typeof storageErrorCodes)[number];

export interface StorageErrorOptions {
  cause?: unknown;
  retryable?: boolean;
}

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly retryable: boolean;

  constructor(code: StorageErrorCode, message: string, options: StorageErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

export function wrapStorageError(
  code: StorageErrorCode,
  message: string,
  error: unknown,
  retryable = false
): StorageError {
  return new StorageError(code, message, { cause: error, retryable });
}
