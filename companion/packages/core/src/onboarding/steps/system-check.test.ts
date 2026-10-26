import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemCheckStep } from './system-check.js';
import type { StepContext } from '../contracts.js';

function createMockContext(): StepContext {
  return {
    log: vi.fn(),
    signal: new AbortController().signal,
  };
}

describe('SystemCheckStep', () => {
  let step: SystemCheckStep;

  beforeEach(() => {
    step = new SystemCheckStep();
  });

  it('has correct metadata', () => {
    expect(step.id).toBe('system-check');
    expect(step.title).toBe('System requirements check');
    expect(step.dependsOn).toEqual([]);
    expect(step.required).toBe(true);
    expect(step.skippable).toBe(false);
  });

  it('detects satisfied requirements on Windows', async () => {
    const ctx = createMockContext();
    const result = await step.detect(ctx);

    // Should pass on Windows development machine
    if (process.platform === 'win32') {
      expect(result.status).toBe('satisfied');
    } else {
      expect(result.status).toBe('failed');
      if (result.status === 'failed') {
        expect(result.code).toBe('UNSUPPORTED_PLATFORM');
      }
    }
  });

  it('provides explanation', async () => {
    const ctx = createMockContext();
    const explanation = await step.explain(ctx);

    expect(explanation.summary).toContain('system');
    expect(explanation.rationale).toBeDefined();
    expect(explanation.dataHandling).toContain('No data is sent');
    expect(explanation.estimatedSeconds).toBeGreaterThan(0);
  });

  it('runs check and returns result', async () => {
    const ctx = createMockContext();
    const result = await step.run(ctx);

    if (process.platform === 'win32') {
      expect(result.outcome).toBe('completed');
    } else {
      expect(result.outcome).toBe('failed');
    }
  });

  it('verifies system check results', async () => {
    const ctx = createMockContext();
    const result = await step.verify(ctx);

    if (process.platform === 'win32') {
      expect(result.outcome).toBe('completed');
    } else {
      expect(result.outcome).toBe('failed');
    }
  });

  it('repair returns failure when requirements are not met', async () => {
    const ctx = createMockContext();
    const result = await step.repair(ctx);

    // On Windows should succeed, on other platforms should fail
    if (process.platform === 'win32') {
      expect(result.outcome).toBe('completed');
    } else {
      expect(result.outcome).toBe('failed');
      if (result.outcome === 'failed') {
        expect(result.message).toContain('manual intervention');
      }
    }
  });

  it('rollback completes without error', async () => {
    const ctx = createMockContext();
    await expect(step.rollback(ctx)).resolves.toBeUndefined();
  });

  it('logs during detection', async () => {
    const ctx = createMockContext();
    await step.detect(ctx);

    expect(ctx.log).toHaveBeenCalled();
  });

  it('logs during run', async () => {
    const ctx = createMockContext();
    await step.run(ctx);

    expect(ctx.log).toHaveBeenCalledWith(
      expect.stringContaining('Running system check')
    );
  });
});
