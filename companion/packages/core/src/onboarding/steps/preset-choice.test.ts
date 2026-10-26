import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PresetChoiceStep, PRESETS } from './preset-choice.js';
import type { StepContext } from '../contracts.js';

function createMockContext(): StepContext {
  return {
    log: vi.fn(),
    signal: new AbortController().signal,
  };
}

describe('PresetChoiceStep', () => {
  let step: PresetChoiceStep;

  beforeEach(() => {
    step = new PresetChoiceStep();
  });

  it('has correct metadata', () => {
    expect(step.id).toBe('preset-choice');
    expect(step.title).toBe('Choose your setup preset');
    expect(step.dependsOn).toEqual(['system-check']);
    expect(step.required).toBe(true);
    expect(step.skippable).toBe(true);
  });

  it('detects not started state initially', async () => {
    const ctx = createMockContext();
    const result = await step.detect(ctx);

    expect(result.status).toBe('notStarted');
  });

  it('detects satisfied state after selection', async () => {
    const ctx = createMockContext();
    await step.run(ctx, 'recommended');

    const result = await step.detect(ctx);
    expect(result.status).toBe('satisfied');
  });

  it('provides explanation of presets', async () => {
    const ctx = createMockContext();
    const explanation = await step.explain(ctx);

    expect(explanation.summary).toContain('preset');
    expect(explanation.rationale).toBeDefined();
    expect(explanation.dataHandling).toContain('stored locally');
    expect(explanation.estimatedSeconds).toBeGreaterThan(0);
  });

  it('runs with recommended preset', async () => {
    const ctx = createMockContext();
    const result = await step.run(ctx, 'recommended');

    expect(result.outcome).toBe('completed');
    expect(step.getSelectedPreset()).toBe('recommended');
  });

  it('runs with privacy-first preset', async () => {
    const ctx = createMockContext();
    const result = await step.run(ctx, 'privacy-first');

    expect(result.outcome).toBe('completed');
    expect(step.getSelectedPreset()).toBe('privacy-first');
    const config = step.getPresetConfig('privacy-first');
    expect(config?.memoryApproval).toBe('all');
    expect(config?.reflectionEnabled).toBe(false);
  });

  it('runs with minimal preset', async () => {
    const ctx = createMockContext();
    const result = await step.run(ctx, 'minimal');

    expect(result.outcome).toBe('completed');
    expect(step.getSelectedPreset()).toBe('minimal');
  });

  it('defaults to recommended when no preset specified', async () => {
    const ctx = createMockContext();
    const result = await step.run(ctx);

    expect(result.outcome).toBe('completed');
    expect(step.getSelectedPreset()).toBe('recommended');
  });

  it('rejects invalid preset', async () => {
    const ctx = createMockContext();
    // @ts-expect-error - testing invalid input
    const result = await step.run(ctx, 'invalid-preset');

    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') {
      expect(result.code).toBe('INVALID_PRESET');
    }
  });

  it('verifies successful selection', async () => {
    const ctx = createMockContext();
    await step.run(ctx, 'privacy-first');

    const result = await step.verify(ctx);
    expect(result.outcome).toBe('completed');
  });

  it('verifies fails when not selected', async () => {
    const ctx = createMockContext();
    const result = await step.verify(ctx);

    expect(result.outcome).toBe('failed');
    if (result.outcome === 'failed') {
      expect(result.code).toBe('PRESET_NOT_SELECTED');
    }
  });

  it('repairs by defaulting to recommended', async () => {
    const ctx = createMockContext();
    const result = await step.repair(ctx);

    expect(result.outcome).toBe('completed');
    expect(step.getSelectedPreset()).toBe('recommended');
  });

  it('rollback clears selection', async () => {
    const ctx = createMockContext();
    await step.run(ctx, 'privacy-first');
    expect(step.getSelectedPreset()).toBe('privacy-first');

    await step.rollback(ctx);
    expect(step.getSelectedPreset()).toBeNull();
  });

  it('getPresetConfig returns correct config', () => {
    const config = step.getPresetConfig('privacy-first');
    expect(config).toEqual(PRESETS['privacy-first']);
  });

  it('getPresetConfig returns null for invalid preset', () => {
    // @ts-expect-error - testing invalid input
    const config = step.getPresetConfig('invalid');
    expect(config).toBeNull();
  });

  it('logs during operations', async () => {
    const ctx = createMockContext();
    await step.run(ctx, 'recommended');

    expect(ctx.log).toHaveBeenCalledWith(
      expect.stringContaining('Preset selected')
    );
  });
});
