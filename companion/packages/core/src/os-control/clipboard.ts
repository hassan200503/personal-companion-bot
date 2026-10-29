export interface ClipboardPort {
  readText(): Promise<string> | string;
  writeText(value: string): Promise<void> | void;
}

/** Runs a paste operation without leaving the owner's clipboard changed. */
export async function withRestoredClipboard<T>(clipboard: ClipboardPort, temporaryText: string, operation: () => Promise<T> | T): Promise<T> {
  const original = await clipboard.readText();
  try {
    await clipboard.writeText(temporaryText);
    return await operation();
  } finally {
    await clipboard.writeText(original);
  }
}
