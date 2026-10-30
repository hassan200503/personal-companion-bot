/**
 * Onboarding engine implementation
 *
 * A persisted state machine that orchestrates setup steps with idempotency,
 * resumability after crashes, and cancellation support.
 */

import type {
  OnboardingEngine,
  OnboardingState,
  OnboardingStorage,
  StepContext,
  StepRegistry,
  StepResult,
  SetupStep,
} from './contracts.js';

export class DefaultOnboardingEngine implements OnboardingEngine {
  private state: OnboardingState;

  constructor(
    private readonly registry: StepRegistry,
    private readonly storage: OnboardingStorage
  ) {
    // Initial state will be loaded in initialize()
    this.state = this.createInitialState();
  }

  private createInitialState(): OnboardingState {
    return {
      currentStep: null,
      completed: {},
      failed: {},
      startedAt: null,
      completedAt: null,
      preset: null,
    };
  }

  async initialize(): Promise<void> {
    this.state = await this.storage.loadState();
  }

  async getState(): Promise<OnboardingState> {
    return { ...this.state };
  }

  async run(ctx: StepContext): Promise<void> {
    // Mark onboarding as started if not already
    if (!this.state.startedAt) {
      this.state.startedAt = Date.now();
      await this.persistState();
    }

    const orderedSteps = this.registry.ordered();

    for (const step of orderedSteps) {
      // Check for cancellation
      if (ctx.signal.aborted) {
        ctx.log('Onboarding cancelled');
        return;
      }

      // Skip if already completed
      if (this.isStepCompleted(step.id)) {
        ctx.log(`Step ${step.id} already completed, skipping`);
        continue;
      }

      // Skip if already failed (unless we're in repair mode)
      if (this.state.failed[step.id]) {
        ctx.log(`Step ${step.id} previously failed, skipping`);
        continue;
      }

      // Execute the step
      await this.executeStep(step, ctx);

      // Check if we should stop after this step
      if (this.state.failed[step.id]) {
        // Required step failed, stop onboarding
        if (step.required) {
          ctx.log(`Required step ${step.id} failed, stopping onboarding`);
          return;
        }
      }
    }

    // All steps completed or skipped
    if (!this.state.completedAt) {
      this.state.completedAt = Date.now();
      await this.persistState();
      ctx.log('Onboarding completed');
    }
  }

  async repair(ctx: StepContext): Promise<void> {
    ctx.log('Running Setup Doctor to repair broken steps');

    const orderedSteps = this.registry.ordered();

    for (const step of orderedSteps) {
      if (ctx.signal.aborted) {
        ctx.log('Repair cancelled');
        return;
      }

      // Only repair previously completed steps
      if (!this.isStepCompleted(step.id)) {
        continue;
      }

      // Check if step is still satisfied
      const detection = await step.detect(ctx);
      
      if (detection.status === 'satisfied') {
        ctx.log(`Step ${step.id} is still healthy`);
        continue;
      }

      ctx.log(`Step ${step.id} needs repair: ${detection.status}`);

      // Mark current step
      this.state.currentStep = step.id;
      await this.persistState();

      try {
        const result = await step.repair(ctx);

        if (result.outcome === 'completed') {
          ctx.log(`Step ${step.id} repaired successfully`);
          // Update completion timestamp
          this.state.completed[step.id] = {
            timestamp: Date.now(),
            outcome: 'completed',
          };
        } else if (result.outcome === 'failed') {
          ctx.log(`Step ${step.id} repair failed: ${result.message}`);
          this.state.failed[step.id] = {
            timestamp: Date.now(),
            code: result.code,
            message: result.message,
          };
          // Remove from completed
          delete this.state.completed[step.id];
        }
      } catch (error) {
        ctx.log(`Step ${step.id} repair threw: ${error}`);
        this.state.failed[step.id] = {
          timestamp: Date.now(),
          code: 'REPAIR_ERROR',
          message: error instanceof Error ? error.message : String(error),
        };
        delete this.state.completed[step.id];
      }

      this.state.currentStep = null;
      await this.persistState();
    }

    ctx.log('Setup Doctor completed');
  }

  async skip(stepId: string): Promise<void> {
    const step = this.registry.get(stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found`);
    }

    if (!step.skippable) {
      throw new Error(`Step ${stepId} cannot be skipped`);
    }

    if (this.isStepCompleted(stepId)) {
      throw new Error(`Step ${stepId} is already completed`);
    }

    this.state.completed[stepId] = {
      timestamp: Date.now(),
      outcome: 'skipped',
    };

    await this.persistState();
  }

  async reset(): Promise<void> {
    this.state = this.createInitialState();
    await this.persistState();
  }

  async setPreset(preset: 'recommended' | 'privacy-first' | 'minimal'): Promise<void> {
    this.state.preset = preset;
    await this.persistState();
  }

  private async executeStep(
    step: SetupStep,
    ctx: StepContext
  ): Promise<void> {
    ctx.log(`Executing step: ${step.id}`);

    // Mark current step
    this.state.currentStep = step.id;
    await this.persistState();

    try {
      // Detect current status
      const detection = await step.detect(ctx);

      if (detection.status === 'satisfied') {
        ctx.log(`Step ${step.id} already satisfied`);
        this.state.completed[step.id] = {
          timestamp: Date.now(),
          outcome: 'completed',
        };
        this.state.currentStep = null;
        await this.persistState();
        return;
      }

      if (detection.status === 'failed') {
        ctx.log(`Step ${step.id} detection failed: ${detection.message}`);
        this.state.failed[step.id] = {
          timestamp: Date.now(),
          code: detection.code,
          message: detection.message,
        };
        this.state.currentStep = null;
        await this.persistState();
        return;
      }

      // Run the step
      const result = await step.run(ctx);

      await this.handleStepResult(step, result);

    } catch (error) {
      ctx.log(`Step ${step.id} threw: ${error}`);
      this.state.failed[step.id] = {
        timestamp: Date.now(),
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : String(error),
      };
    }

    this.state.currentStep = null;
    await this.persistState();
  }

  private async handleStepResult(
    step: SetupStep,
    result: StepResult
  ): Promise<void> {
    switch (result.outcome) {
      case 'completed':
        this.state.completed[step.id] = {
          timestamp: Date.now(),
          outcome: 'completed',
        };
        break;

      case 'skipped':
        this.state.completed[step.id] = {
          timestamp: Date.now(),
          outcome: 'skipped',
        };
        break;

      case 'needsUser':
        // Step needs user interaction, will be resumed later
        // Don't mark as completed or failed
        break;

      case 'failed':
        this.state.failed[step.id] = {
          timestamp: Date.now(),
          code: result.code,
          message: result.message,
        };
        break;
    }
  }

  private isStepCompleted(stepId: string): boolean {
    return stepId in this.state.completed;
  }

  private async persistState(): Promise<void> {
    await this.storage.saveState(this.state);
  }
}
