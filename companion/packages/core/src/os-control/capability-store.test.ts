import { describe, expect, it } from 'vitest';
import { InMemoryCapabilityStore, PersistentCapabilityStore } from './capability-store.js';

describe('capability store', () => {
  it('keys capabilities by app version and updates observed success rate', () => {
    const store = new InMemoryCapabilityStore();
    store.put({ appId: 'notepad', version: '1', integrity: 'medium', accessibilityElements: 106, supportedLevels: ['L0', 'L2'], successRate: 1, observations: 1, verifiedAt: 'a' });
    expect(store.get('notepad', '2')).toBeUndefined();
    store.recordOutcome('notepad', '1', false, 'b');
    expect(store.get('notepad', '1')?.successRate).toBeLessThan(1);
    expect(store.get('notepad', '1')?.observations).toBe(2);
  });

  it('round-trips through a durable key-value store', () => {
    const backing = new Map<string, string>();
    const store = new PersistentCapabilityStore({ read: (key) => backing.get(key), write: (key, value) => backing.set(key, value) });
    store.put({ appId: 'notepad', version: '1', integrity: 'medium', accessibilityElements: 39, supportedLevels: ['L2'], successRate: 1, observations: 1, verifiedAt: 'a' });
    const reloaded = new PersistentCapabilityStore({ read: (key) => backing.get(key), write: (key, value) => backing.set(key, value) });
    expect(reloaded.get('notepad', '1')?.accessibilityElements).toBe(39);
    expect(reloaded.get('notepad', '2')).toBeUndefined();
  });
});
