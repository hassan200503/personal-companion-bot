import type { OnboardingState, OnboardingStorage } from './contracts.js';
import type { CompanionDatabase } from '../storage/database.js';

/**
 * Database-backed storage for onboarding state
 * Persists state to encrypted database for crash recovery
 */
export class DatabaseOnboardingStorage implements OnboardingStorage {
  constructor(private db: CompanionDatabase) {}

  async loadState(): Promise<OnboardingState> {
    const row = this.db.raw.prepare(
      'SELECT state FROM onboarding_state WHERE id = 1'
    ).get() as { state: string } | undefined;

    if (!row) {
      // Return initial empty state
      return {
        completed: {},
        failed: {},
        currentStep: null,
        startedAt: null,
        completedAt: null,
        preset: null,
      };
    }

    return JSON.parse(row.state) as OnboardingState;
  }

  async saveState(state: OnboardingState): Promise<void> {
    const serialized = JSON.stringify(state);
    
    this.db.raw.prepare(
      `INSERT INTO onboarding_state (id, state, updated_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at`
    ).run(serialized);
  }
}

/**
 * In-memory storage for testing
 */
export class InMemoryOnboardingStorage implements OnboardingStorage {
  private state: OnboardingState = {
    completed: {},
    failed: {},
    currentStep: null,
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
}
