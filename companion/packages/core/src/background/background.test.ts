import { describe, expect, it, vi } from 'vitest';
import { DefaultScheduler, BoundedReflectionLoop } from './contracts.js';

describe('scheduler', () => {
  it('runs registered job via runOnce', async () => {
    const sched = new DefaultScheduler();
    const fn = vi.fn();
    sched.register({ id: 'j1', intervalMs: 1000, run: fn });
    await sched.runOnce('j1');
    expect(fn).toHaveBeenCalled();
  });

  it('start/stop toggles running', () => {
    const sched = new DefaultScheduler();
    sched.start();
    expect(sched.isRunning()).toBe(true);
    sched.stop();
    expect(sched.isRunning()).toBe(false);
  });
});

describe('reflection loop', () => {
  it('stops at max iterations', async () => {
    const loop = new BoundedReflectionLoop({ maxIterations: 3, maxDurationMs: 10000 });
    const r = await loop.run();
    expect(r.iterations).toBe(3);
    expect(r.stoppedReason).toBe('max_iterations');
  });

  it('stops when onIteration returns false', async () => {
    let n = 0;
    const loop = new BoundedReflectionLoop({
      maxIterations: 10,
      maxDurationMs: 10000,
      onIteration: () => {
        n++;
        return n >= 2 ? false : true;
      },
    });
    const r = await loop.run();
    expect(r.iterations).toBe(2);
    expect(r.stoppedReason).toBe('completed');
  });
});