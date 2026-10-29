import { describe, expect, it } from 'vitest';
import { ProactiveEngine } from './engine.js';

const candidate = { id: 'r1', topic: 'deadline', message: 'A task is due.', reason: 'Owner marked this deadline important.', urgency: 0.95, importance: 0.9, createdAt: 1 };

describe('proactive engine', () => {
  it('stores a reason and honors cooldown, quiet hours and budget', () => {
    const engine = new ProactiveEngine();
    expect(engine.evaluate(candidate, { now: 10_000 }).show).toBe(true);
    expect(engine.evaluate({ ...candidate, id: 'r2' }, { now: 10_001 }).reason).toBe('cooldown');
    expect(engine.evaluate({ ...candidate, id: 'r3' }, { now: 20_000, quietHours: { start: 0, end: 24 } }).reason).toBe('quiet_or_focus');
    expect(engine.evaluate({ ...candidate, id: 'r4' }, { now: 20_000, spokenDailyCap: 0 }).reason).toBe('spoken_budget');
  });

  it('suppresses dismissed topics and exposes resettable receptivity', () => {
    const engine = new ProactiveEngine();
    engine.dismiss('deadline', Date.now() + 60_000);
    expect(engine.evaluate(candidate, { now: 10_000 }).reason).toBe('dismissed');
    expect(Object.values(engine.getReceptivity()).some((value) => value.dismissed === 1)).toBe(true);
    engine.resetReceptivity();
    expect(engine.getReceptivity()).toEqual({});
  });
});
