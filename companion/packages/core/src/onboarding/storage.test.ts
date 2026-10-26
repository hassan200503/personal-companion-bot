import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCompanionDatabase, type CompanionDatabase } from '../storage/database.js';
import { FakeKeyProtector, createTestLogger } from '../storage/test-helpers.js';
import {
  DatabaseOnboardingStorage,
  InMemoryOnboardingStorage,
} from './storage.js';
import type { OnboardingState } from './contracts.js';

describe('InMemoryOnboardingStorage', () => {
  let storage: InMemoryOnboardingStorage;

  beforeEach(() => {
    storage = new InMemoryOnboardingStorage();
  });

  it('returns initial empty state', async () => {
    const state = await storage.loadState();

    expect(state.completed).toEqual({});
    expect(state.failed).toEqual({});
    expect(state.currentStep).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.completedAt).toBeNull();
    expect(state.preset).toBeNull();
  });

  it('saves and loads state', async () => {
    const testState: OnboardingState = {
      completed: {
        'step1': { outcome: 'completed', timestamp: 1729935600000 },
      },
      failed: {},
      currentStep: 'step3',
      startedAt: 1729932000000,
      completedAt: null,
      preset: null,
    };

    await storage.saveState(testState);
    const loaded = await storage.loadState();

    expect(loaded).toEqual(testState);
  });

  it('overwrites previous state on save', async () => {
    const state1: OnboardingState = {
      completed: {},
      failed: {},
      currentStep: 'step1',
      startedAt: 1729932000000,
      completedAt: null,
      preset: null,
    };

    const state2: OnboardingState = {
      completed: { 'step1': { outcome: 'completed', timestamp: 1729935600000 } },
      failed: {},
      currentStep: 'step2',
      startedAt: 1729932000000,
      completedAt: null,
      preset: null,
    };

    await storage.saveState(state1);
    await storage.saveState(state2);
    const loaded = await storage.loadState();

    expect(loaded).toEqual(state2);
    expect(loaded.currentStep).toBe('step2');
  });
});

describe('DatabaseOnboardingStorage', () => {
  let tempDir: string;
  let db: CompanionDatabase;
  let storage: DatabaseOnboardingStorage;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'onboarding-storage-test-'));
    const keyProtector = new FakeKeyProtector();
    const { logger } = createTestLogger();
    
    db = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector,
      logger,
    });
    storage = new DatabaseOnboardingStorage(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns initial empty state when no data exists', async () => {
    const state = await storage.loadState();

    expect(state.completed).toEqual({});
    expect(state.failed).toEqual({});
    expect(state.currentStep).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.completedAt).toBeNull();
    expect(state.preset).toBeNull();
  });

  it('saves and loads state from database', async () => {
    const testState: OnboardingState = {
      completed: {
        'system-check': { outcome: 'completed', timestamp: 1729935600000 },
        'preset-choice': { outcome: 'completed', timestamp: 1729935660000 },
      },
      failed: {},
      currentStep: 'provider-setup',
      startedAt: 1729935300000,
      completedAt: null,
      preset: 'recommended',
    };

    await storage.saveState(testState);
    const loaded = await storage.loadState();

    expect(loaded).toEqual(testState);
    expect(loaded.completed['system-check']).toBeDefined();
    expect(loaded.currentStep).toBe('provider-setup');
  });

  it('persists state across storage instances', async () => {
    const testState: OnboardingState = {
      completed: {
        'step1': { outcome: 'completed', timestamp: 1729935600000 },
      },
      failed: {
        'step2': { code: 'TEST_ERROR', message: 'Test failure', timestamp: 1729935660000 },
      },
      currentStep: 'step4',
      startedAt: 1729935000000,
      completedAt: null,
      preset: null,
    };

    await storage.saveState(testState);

    // Create new storage instance with same database
    const storage2 = new DatabaseOnboardingStorage(db);
    const loaded = await storage2.loadState();

    expect(loaded).toEqual(testState);
    expect(loaded.failed['step2']).toBeDefined();
  });

  it('overwrites previous state on save', async () => {
    const state1: OnboardingState = {
      completed: {},
      failed: {},
      currentStep: 'step1',
      startedAt: 1729932000000,
      completedAt: null,
      preset: null,
    };

    const state2: OnboardingState = {
      completed: { 'step1': { outcome: 'completed', timestamp: 1729935600000 } },
      failed: {},
      currentStep: 'step2',
      startedAt: 1729932000000,
      completedAt: null,
      preset: null,
    };

    await storage.saveState(state1);
    await storage.saveState(state2);
    const loaded = await storage.loadState();

    expect(loaded).toEqual(state2);
    expect(loaded.currentStep).toBe('step2');
  });

  it('handles completed onboarding state', async () => {
    const completedState: OnboardingState = {
      completed: {
        'step1': { outcome: 'completed', timestamp: 1729935600000 },
        'step2': { outcome: 'completed', timestamp: 1729935660000 },
      },
      failed: {},
      currentStep: null,
      startedAt: 1729935300000,
      completedAt: 1729935720000,
      preset: 'privacy-first',
    };

    await storage.saveState(completedState);
    const loaded = await storage.loadState();

    expect(loaded.completedAt).toBe(1729935720000);
    expect(loaded.currentStep).toBeNull();
  });

  it('survives database close and reopen', async () => {
    const testState: OnboardingState = {
      completed: {
        'system-check': { outcome: 'completed', timestamp: 1729935600000 },
      },
      failed: {},
      currentStep: 'preset-choice',
      startedAt: 1729935300000,
      completedAt: null,
      preset: null,
    };

    await storage.saveState(testState);
    db.close();

    // Reopen database
    const keyProtector = new FakeKeyProtector();
    const { logger } = createTestLogger();
    db = await openCompanionDatabase({
      userDataDir: tempDir,
      keyProtector,
      logger,
    });
    storage = new DatabaseOnboardingStorage(db);

    const loaded = await storage.loadState();
    expect(loaded).toEqual(testState);
  });
});
