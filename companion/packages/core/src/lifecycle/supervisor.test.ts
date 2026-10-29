import { describe, expect, it } from 'vitest';
import { decideRestart } from './supervisor.js';

describe('supervisor restart policy', () => {
  it('restarts only after an owned crash or stale heartbeat', () => {
    const state = { stopRequested: false, restartTimes: [] };
    expect(decideRestart(state, { kind: 'exit', now: 100, crashMarker: true }).restart).toBe(true);
    expect(decideRestart(state, { kind: 'heartbeat', now: 20_000, heartbeatAt: 0, crashMarker: false }).reason).toBe('hang');
    expect(decideRestart(state, { kind: 'exit', now: 100, crashMarker: false }).reason).toBe('external_termination');
  });

  it('never fights owner stop and caps restart loops', () => {
    expect(decideRestart({ stopRequested: true, restartTimes: [] }, { kind: 'exit', now: 1, crashMarker: true }).restart).toBe(false);
    expect(decideRestart({ stopRequested: false, restartTimes: [1, 2, 3] }, { kind: 'exit', now: 4, crashMarker: true }).reason).toBe('restart_budget_exhausted');
  });
});
