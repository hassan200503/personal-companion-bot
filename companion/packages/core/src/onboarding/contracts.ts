/**
 * Onboarding engine contracts
 *
 * The onboarding engine is a persisted state machine over a registry of setup steps.
 * Each step can detect if it's already satisfied, explain itself, run, verify, repair, and roll back.
 * The engine enforces idempotency, resumability after crashes, and cancellation.
 */

/** Step detection result */
export type StepDetectionResult =
  | { status: 'satisfied' }
  | { status: 'notStarted' }
  | { status: 'needsUser' }
  | { status: 'failed'; code: string; message: string };

/** Step execution result */
export type StepResult<T = void> =
  | { outcome: 'completed'; data?: T }
  | { outcome: 'skipped' }
  | { outcome: 'needsUser'; reason: string }
  | { outcome: 'failed'; code: string; message: string; fix?: string };

/** Step explanation for UI display */
export interface StepExplanation {
  /** What this step does */
  summary: string;
  /** Why it's needed */
  rationale: string;
  /** What data is sent where (if any) */
  dataHandling?: string;
  /** Estimated time in seconds */
  estimatedSeconds: number;
}

/** Execution context provided to step methods */
export interface StepContext {
  /** Signal for cancellation */
  signal: AbortSignal;
  /** Logger for redacted output */
  log: (message: string) => void;
  /** Storage access (when available) */
  storage?: unknown;
  /** Credential access (when available) */
  credentials?: unknown;
}

/** Setup step interface */
export interface SetupStep {
  /** Unique step identifier */
  readonly id: string;
  /** Human-readable title */
  readonly title: string;
  /** Owning module name */
  readonly ownerModule: string;
  /** Step IDs that must complete before this one */
  readonly dependsOn: readonly string[];
  /** Whether this step must complete (cannot be skipped) */
  readonly required: boolean;
  /** Whether user can manually skip */
  readonly skippable: boolean;
  /** Estimated duration in seconds */
  readonly estimatedSeconds: number;

  /**
   * Detect whether this step is already satisfied.
   * Called before every run to enforce idempotency.
   */
  detect(ctx: StepContext): Promise<StepDetectionResult>;

  /**
   * Explain this step in plain language for UI display.
   */
  explain(ctx: StepContext): Promise<StepExplanation>;

  /**
   * Execute this step.
   * Only called if detect() returns notStarted or needsUser.
   */
  run(ctx: StepContext): Promise<StepResult>;

  /**
   * Verify that this step completed successfully.
   * Called after run() to confirm the expected outcome.
   */
  verify(ctx: StepContext): Promise<StepResult>;

  /**
   * Repair a previously completed step that's now broken.
   * Used by Setup Doctor to fix issues after initial setup.
   */
  repair(ctx: StepContext): Promise<StepResult>;

  /**
   * Roll back changes made by this step.
   * Called if a later step fails and rollback is needed.
   */
  rollback(ctx: StepContext): Promise<void>;
}

/** Step registry interface */
export interface StepRegistry {
  /** Register a setup step */
  register(step: SetupStep): void;
  /** Get a step by ID */
  get(id: string): SetupStep | undefined;
  /** Get all registered steps */
  all(): SetupStep[];
  /** Get steps in dependency order */
  ordered(): SetupStep[];
}

/** Persisted engine state */
export interface OnboardingState {
  /** Current step being executed (or null if none) */
  currentStep: string | null;
  /** Map of step ID to completion status */
  completed: Record<string, { 
    timestamp: number;
    outcome: 'completed' | 'skipped';
  }>;
  /** Map of step ID to failure information */
  failed: Record<string, {
    timestamp: number;
    code: string;
    message: string;
  }>;
  /** Onboarding start time */
  startedAt: number | null;
  /** Onboarding completion time */
  completedAt: number | null;
  /** User-selected preset (if any) */
  preset: 'recommended' | 'privacy-first' | 'minimal' | null;
}

/** Onboarding engine interface */
export interface OnboardingEngine {
  /** Get current state */
  getState(): Promise<OnboardingState>;
  
  /** Start or resume onboarding from current state */
  run(ctx: StepContext): Promise<void>;
  
  /** Run Setup Doctor to repair broken steps */
  repair(ctx: StepContext): Promise<void>;
  
  /** Skip a step (if skippable) */
  skip(stepId: string): Promise<void>;
  
  /** Reset onboarding state (for testing) */
  reset(): Promise<void>;

  /** Persist the owner-selected privacy preset */
  setPreset?(preset: 'recommended' | 'privacy-first' | 'minimal'): Promise<void>;
}

/** Storage interface for persisting onboarding state */
export interface OnboardingStorage {
  loadState(): Promise<OnboardingState>;
  saveState(state: OnboardingState): Promise<void>;
}
