import { describe, expect, it } from 'vitest';
import { decideSupervisorAction } from './supervisor.js';

describe('packaged supervisor policy', () => {
  it('restarts an owned crash but never an owner stop or external exit', () => {
    const now = 100_000;
    expect(decideSupervisorAction(now, process.pid, { pid: process.pid, at: now }, { at: now }, undefined, [])).toBe('restart_crash');
    expect(decideSupervisorAction(now, process.pid, { pid: process.pid, at: now }, undefined, { at: now }, [])).toBe('exit');
    expect(decideSupervisorAction(now, 99999999, { pid: 99999999, at: now - 20_000 }, undefined, undefined, [])).toBe('exit');
  });

  it('restarts a live hung process and caps restart storms', () => {
    const now = Date.now();
    expect(decideSupervisorAction(now, process.pid, { pid: process.pid, at: now - 20_000 }, undefined, undefined, [])).toBe('restart_hang');
    expect(decideSupervisorAction(now, process.pid, { pid: process.pid, at: now - 20_000 }, undefined, undefined, [now - 1, now - 2, now - 3])).toBe('exit');
  });
});
