/**
 * Step registry tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DefaultStepRegistry } from './registry.js';
import type { SetupStep } from './contracts.js';

// Mock step factory
function createMockStep(
  id: string,
  dependsOn: string[] = [],
  required = false
): SetupStep {
  return {
    id,
    title: `Step ${id}`,
    ownerModule: 'test',
    dependsOn,
    required,
    skippable: !required,
    estimatedSeconds: 10,
    detect: async () => ({ status: 'notStarted' }),
    explain: async () => ({
      summary: 'Test step',
      rationale: 'For testing',
      estimatedSeconds: 10,
    }),
    run: async () => ({ outcome: 'completed' }),
    verify: async () => ({ outcome: 'completed' }),
    repair: async () => ({ outcome: 'completed' }),
    rollback: async () => {},
  };
}

describe('DefaultStepRegistry', () => {
  let registry: DefaultStepRegistry;

  beforeEach(() => {
    registry = new DefaultStepRegistry();
  });

  it('registers and retrieves steps', () => {
    const step = createMockStep('test-step');
    registry.register(step);

    expect(registry.get('test-step')).toBe(step);
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('rejects duplicate registration', () => {
    const step = createMockStep('test-step');
    registry.register(step);

    expect(() => registry.register(step)).toThrow(
      'Step test-step is already registered'
    );
  });

  it('returns all registered steps', () => {
    const step1 = createMockStep('step1');
    const step2 = createMockStep('step2');

    registry.register(step1);
    registry.register(step2);

    const all = registry.all();
    expect(all).toHaveLength(2);
    expect(all).toContain(step1);
    expect(all).toContain(step2);
  });

  it('orders steps with no dependencies', () => {
    const step1 = createMockStep('step1');
    const step2 = createMockStep('step2');

    registry.register(step1);
    registry.register(step2);

    const ordered = registry.ordered();
    expect(ordered).toHaveLength(2);
    // Both are valid orderings since they have no dependencies
    expect(ordered.some((s) => s.id === 'step1')).toBe(true);
    expect(ordered.some((s) => s.id === 'step2')).toBe(true);
  });

  it('orders steps with linear dependencies', () => {
    const step1 = createMockStep('step1');
    const step2 = createMockStep('step2', ['step1']);
    const step3 = createMockStep('step3', ['step2']);

    registry.register(step1);
    registry.register(step2);
    registry.register(step3);

    const ordered = registry.ordered();
    expect(ordered.map((s) => s.id)).toEqual(['step1', 'step2', 'step3']);
  });

  it('orders steps with diamond dependencies', () => {
    //     step1
    //    /      \
    //  step2   step3
    //    \      /
    //     step4
    const step1 = createMockStep('step1');
    const step2 = createMockStep('step2', ['step1']);
    const step3 = createMockStep('step3', ['step1']);
    const step4 = createMockStep('step4', ['step2', 'step3']);

    registry.register(step1);
    registry.register(step2);
    registry.register(step3);
    registry.register(step4);

    const ordered = registry.ordered();
    expect(ordered[0].id).toBe('step1'); // Must be first
    expect(ordered[3].id).toBe('step4'); // Must be last
    // step2 and step3 can be in either order
    expect(['step2', 'step3']).toContain(ordered[1].id);
    expect(['step2', 'step3']).toContain(ordered[2].id);
  });

  it('detects cycles in dependencies', () => {
    const step1 = createMockStep('step1', ['step2']);
    const step2 = createMockStep('step2', ['step1']);

    registry.register(step1);
    registry.register(step2);

    expect(() => registry.ordered()).toThrow(
      /Cycle detected in step dependencies/
    );
  });

  it('detects missing dependencies', () => {
    const step = createMockStep('step1', ['nonexistent']);
    registry.register(step);

    expect(() => registry.ordered()).toThrow(
      'Step step1 depends on nonexistent, but nonexistent is not registered'
    );
  });

  it('handles complex dependency graphs', () => {
    // Create a more complex DAG
    const stepA = createMockStep('A');
    const stepB = createMockStep('B', ['A']);
    const stepC = createMockStep('C', ['A']);
    const stepD = createMockStep('D', ['B', 'C']);
    const stepE = createMockStep('E', ['C']);
    const stepF = createMockStep('F', ['D', 'E']);

    registry.register(stepA);
    registry.register(stepB);
    registry.register(stepC);
    registry.register(stepD);
    registry.register(stepE);
    registry.register(stepF);

    const ordered = registry.ordered();
    const ids = ordered.map((s) => s.id);

    // Verify ordering constraints
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
    expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'));
    expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('E'));
    expect(ids.indexOf('D')).toBeLessThan(ids.indexOf('F'));
    expect(ids.indexOf('E')).toBeLessThan(ids.indexOf('F'));
  });
});
