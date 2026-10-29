import { describe, expect, it } from 'vitest';
import { withRestoredClipboard } from './clipboard.js';

function fakeClipboard(initial: string) {
  let value = initial;
  return { port: { readText: () => value, writeText: (next: string) => { value = next; } }, read: () => value };
}

describe('clipboard safety', () => {
  it('restores the original clipboard after success', async () => {
    const clipboard = fakeClipboard('owner text');
    await withRestoredClipboard(clipboard.port, 'temporary', () => expect(clipboard.read()).toBe('temporary'));
    expect(clipboard.read()).toBe('owner text');
  });

  it('restores the original clipboard after failure', async () => {
    const clipboard = fakeClipboard('owner text');
    await expect(withRestoredClipboard(clipboard.port, 'temporary', () => { throw new Error('paste failed'); })).rejects.toThrow('paste failed');
    expect(clipboard.read()).toBe('owner text');
  });
});
