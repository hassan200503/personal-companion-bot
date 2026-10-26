/**
 * Step registry implementation
 *
 * Maintains a registry of setup steps and provides dependency-ordered access.
 */

import type { SetupStep, StepRegistry } from './contracts.js';

export class DefaultStepRegistry implements StepRegistry {
  private steps = new Map<string, SetupStep>();

  register(step: SetupStep): void {
    if (this.steps.has(step.id)) {
      throw new Error(`Step ${step.id} is already registered`);
    }
    this.steps.set(step.id, step);
  }

  get(id: string): SetupStep | undefined {
    return this.steps.get(id);
  }

  all(): SetupStep[] {
    return Array.from(this.steps.values());
  }

  ordered(): SetupStep[] {
    // Topological sort using Kahn's algorithm
    const steps = this.all();
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize
    for (const step of steps) {
      inDegree.set(step.id, 0);
      adjList.set(step.id, []);
    }

    // Build adjacency list and in-degree map
    for (const step of steps) {
      for (const dep of step.dependsOn) {
        if (!this.steps.has(dep)) {
          throw new Error(
            `Step ${step.id} depends on ${dep}, but ${dep} is not registered`
          );
        }
        adjList.get(dep)!.push(step.id);
        inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: SetupStep[] = [];

    // Add all steps with no dependencies
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const stepId = queue.shift()!;
      const step = this.steps.get(stepId);
      if (!step) continue;

      result.push(step);

      // Reduce in-degree for dependent steps
      for (const dependent of adjList.get(stepId) || []) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (result.length !== steps.length) {
      throw new Error(
        'Cycle detected in step dependencies: ' +
          Array.from(inDegree.entries())
            .filter(([, degree]) => degree > 0)
            .map(([id]) => id)
            .join(', ')
      );
    }

    return result;
  }
}
