import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('desktop learning boundary', () => {
  it('does not auto-promote provider-extracted facts into memory.profile', () => {
    const mainPath = fileURLToPath(new URL('./index.ts', import.meta.url));
    const source = readFileSync(mainPath, 'utf8');
    const start = source.indexOf('const msg = await conversationEngine.sendMessage');
    const end = source.indexOf('return { id: msg.id', start);
    const responseBoundary = source.slice(start, end);
    expect(responseBoundary).not.toContain('providerRouter.complete');
    expect(responseBoundary).not.toContain("memory.profile");
    expect(responseBoundary).toContain('Learning is proposal-only');
  });
});
