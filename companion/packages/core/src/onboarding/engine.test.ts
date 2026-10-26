/**
 * Onboarding engine tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefaultOnboardingEngine } from './engine.js';
import { DefaultStepRegistry } from './registry.js';
import type {
  SetupStep,
  StepContext,
  StepDetectionResult,
  StepResult,
  OnboardingState,
  OnboardingStorage,
} from './contracts.js';

// In-memory storage for testing
class MemoryStorage implements OnboardingStorage {
  private state: OnboardingState = {
    currentStep: null,
    completed: {},
    failed: {},
    startedAt: null,
    completedAt: null,
    preset: null,
  };

  async loadState(): Promise<OnboardingState> {
    return { ...this.state };
  }

  async saveState(state: OnboardingState): Promise<void> {
    this.state = { ...state };
  }

  reset(): void {
    this.state = {
      currentStep: null,
      completed: {},
      failed: {},
      startedAt: null,
      completedAt: null,
      preset: null,
    };
  }
}

// Mock step factory
function createMockStep(
  id: string,
  config: {
    dependsOn?: string[];
    required?: boolean;
    detectResult?: StepDetectionResult;
    runResult?: StepResult;
    shouldThrow?: boolean;
  } = {}
): SetupStep {
  const {
    dependsOn = [],
    required = false,
    detectResult = { status: 'notStarted' },
    runResult = { outcome: 'completed' },
    shouldThrow = false,
  } = config;

  return {
    id,
    title: `Step ${id}`,
    ownerModule: 'test',
    dependsOn,
    required,
    skippable: !required,
    estimatedSeconds: 10,
    detect: vi.fn(async () => detectResult),
    explain: vi.fn(async () => ({
      summary: 'Test step',
      rationale: 'For testing',
      estimatedSeconds: 10,
    })),
    run: vi.fn(async () => {
      if (shouldThrow) throw new Error('Step failed');
      return runResult;
    }),
    verify: vi.fn(async (): Promise<StepResult> => ({ outcome: 'completed' })),
    repair: vi.fn(async (): Promise<StepResult> => ({ outcome: 'completed' })),
    rollback: vi.fn(async () => {}),
  };
}

function createMockContext(): StepContext {
  return {
    signal: new AbortController().signal,
    log: vi.fn(),
  };
}

describe('DefaultOnboardingEngine', () => {
  let registry: DefaultStepRegistry;
  let storage: MemoryStorage;
  let engine: DefaultOnboardingEngine;

  beforeEach(() => {
    registry = new DefaultStepRegistry();
    storage = new MemoryStorage();
    engine = new DefaultOnboardingEngine(registry, storage);
  });

  it('initializes with empty state', async () => {
    await engine.initialize();
    const state = await engine.getState();

    expect(state.currentStep).toBeNull();
    expect(state.completed).toEqual({});
    expect(state.failed).toEqual({});
    expect(state.startedAt).toBeNull();
    expect(state.completedAt).toBeNull();
  });

  it('executes steps in dependency order', async () => {
    const step1 = createMockStep('step1');
    const step2 = createMockStep('step2', { dependsOn: ['step1'] });

    registry.register(step1);
    registry.register(step2);

    await engine.initialize();
    await engine.run(createMockContext());

    const state = await engine.getState();

    expect(state.completed['step1']).toBeDefined();
    expect(state.completed['step2']).toBeDefined();
    expect(state.completedAt).toBeGreaterThan(0);
  });

  it('skips already satisfied steps via detect', async () => {
    const step = createMockStep('step1', {
      detectResult: { status: 'satisfied' },
    });

    registry.register(step);

    await engine.initialize();
    await engine.run(createMockContext());

    // run() should not be called since detect returned satisfied
    expect(step.run).not.toHaveBeenCalled();
    expect(step.detect).toHaveBeenCalled();

    const state = await engine.getState();
    expect(state.completed['step1']).toBeDefined();
  });

  it('resumes after previous execution', async () => {
    const step1 = createMockStep('step1');
    const step2 = createMockStep('step2', { dependsOn: ['step1'] });

    registry.register(step1);
    registry.register(step2);

    await engine.initialize();
    
    // Run step1
    await engine.run(createMockContext());

    // Create new engine with same storage (simulating restart)
    const engine2 = new DefaultOnboardingEngine(registry, storage);
    await engine2.initialize();

    const stateBefore = await engine2.getState();
    expect(stateBefore.completed['step1']).toBeDefined();

    // Run again - step1 should be skipped, only step2 should run
    const ctx = createMockContext();
    await engine2.run(ctx);

    expect(ctx.log).toHaveBeenCalledWith(
      expect.stringContaining('step1 already completed')
    );
  });

  it('marks failed steps', async () => {
    const step = createMockStep('step1', {
      runResult: {
        outcome: 'failed',
        code: 'TEST_ERROR',
        message: 'Test failure',
      },
    });

    registry.register(step);

    await engine.initialize();
    await engine.run(createMockContext());

    const state = await engine.getState();
    expect(state.failed['step1']).toBeDefined();
    expect(state.failed['step1']!.code).toBe('TEST_ERROR');
    expect(state.completed['step1']).toBeUndefined();
  });

  it('stops on required step failure', async () => {
    const step1 = createMockStep('step1', {
      required: true,
      runResult: {
        outcome: 'failed',
        code: 'ERROR',
        message: 'Failed',
      },
    });
    const step2 = createMockStep('step2', { dependsOn: ['step1'] });

    registry.register(step1);
    registry.register(step2);

    await engine.initialize();
    await engine.run(createMockContext());

    const state = await engine.getState();
    expect(state.failed['step1']).toBeDefined();
    expect(state.completed['step2']).toBeUndefined();
    expect(state.completedAt).toBeNull();
  });

  it('handles step exceptions', async () => {
    const step = createMockStep('step1', { shouldThrow: true });

    registry.register(step);

    await engine.initialize();
    await engine.run(createMockContext());

    const state = await engine.getState();
    expect(state.failed['step1']).toBeDefined();
    expect(state.failed['step1']!.code).toBe('EXECUTION_ERROR');
  });

  it('supports cancellation via AbortSignal', async () => {
    const step1 = createMockStep('step1');
    const step2 = createMockStep('step2', { dependsOn: ['step1'] });

    registry.register(step1);
    registry.register(step2);

    await engine.initialize();

    const controller = new AbortController();
    const ctx = createMockContext();
    ctx.signal = controller.signal;

    // Cancel after first step
    step1.run = vi.fn(async (): Promise<StepResult> => {
      controller.abort();
      return { outcome: 'completed' };
    });

    await engine.run(ctx);

    const state = await engine.getState();
    expect(state.completed['step1']).toBeDefined();
    expect(state.completed['step2']).toBeUndefined();
  });

  it('allows skipping skippable steps', async () => {
    const step = createMockStep('step1', { required: false });

    registry.register(step);

    await engine.initialize();
    await engine.skip('step1');

    const state = await engine.getState();
    expect(state.completed['step1']).toBeDefined();
    expect(state.completed['step1']!.outcome).toBe('skipped');
  });

  it('rejects skipping required steps', async () => {
    const step = createMockStep('step1', { required: true });

    registry.register(step);

    await engine.initialize();

    await expect(engine.skip('step1')).rejects.toThrow(
      'Step step1 cannot be skipped'
    );
  });

  it('repairs previously completed but now broken steps', async () => {
    const step = createMockStep('step1');

    registry.register(step);

    await engine.initialize();

    // Complete the step
    await engine.run(createMockContext());

    let state = await engine.getState();
    expect(state.completed['step1']).toBeDefined();

    // Simulate step becoming broken
    step.detect = vi.fn(async (): Promise<{ status: 'failed'; code: string; message: string }> => ({
      status: 'failed',
      code: 'BROKEN',
      message: 'Step is broken',
    }));

    // Run repair
    const ctx = createMockContext();
    await engine.repair(ctx);

    state = await engine.getState();
    expect(step.repair).toHaveBeenCalled();
    expect(ctx.log).toHaveBeenCalledWith(
      expect.stringContaining('needs repair')
    );
    // State should reflect repair was attempted
    expect(state.completed['step1']).toBeDefined();
  });

  it('resets state', async () => {
    const step = createMockStep('step1');

    registry.register(step);

    await engine.initialize();
    await engine.run(createMockContext());

    let state = await engine.getState();
    expect(state.completed['step1']).toBeDefined();

    await engine.reset();

    state = await engine.getState();
    expect(state.completed).toEqual({});
    expect(state.failed).toEqual({});
    expect(state.startedAt).toBeNull();
    expect(state.completedAt).toBeNull();
  });

  it('persists state after each step', async () => {
    const step1 = createMockStep('step1');
    const step2 = createMockStep('step2', { dependsOn: ['step1'] });

    registry.register(step1);
    registry.register(step2);

    await engine.initialize();

    // Spy on storage
    const saveSpy = vi.spyOn(storage, 'saveState');

    await engine.run(createMockContext());

    // Should save: startedAt, after step1, after step2, completedAt
    expect(saveSpy).toHaveBeenCalled();
    expect(saveSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
