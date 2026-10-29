import { describe, expect, it } from 'vitest';
import { performUiAutomationAction } from './uia.js';

describe('UI Automation service', () => {
  it('fails closed for invalid process IDs and missing selectors', async () => {
    await expect(performUiAutomationAction(0, { name: 'Notepad' }, { kind: 'invoke' })).resolves.toEqual({
      ok: false,
      observed: false,
      error: 'invalid_process_id',
    });
    await expect(performUiAutomationAction(1234, {}, { kind: 'invoke' })).resolves.toEqual({
      ok: false,
      observed: false,
      error: 'selector_required',
    });
  });
});
