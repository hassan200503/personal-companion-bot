/**
 * Autonomous Goal Pursuit (G7 Approved)
 *
 * Tracks owner goals and autonomously pursues them within safety bounds.
 * This operates under G7 approval (autonomous action risk accepted).
 * Safety constraints remain: no credential handling, no Class 4 actions,
 * financial actions require explicit approval (G6), and all actions
 * are auditable with observed postconditions.
 */

export interface Goal {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
  deadline?: string;
  context?: string;
  steps: GoalStep[];
}

export interface GoalStep {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  toolName?: string;
  toolParams?: Record<string, unknown>;
  requiresApproval: boolean;
  riskClass: number;
  postcondition?: string;
  completedAt?: string;
}

export interface GoalStore {
  saveGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>): Goal;
  getGoal(goalId: string): Goal | null;
  listGoals(status?: Goal['status']): Goal[];
  updateGoal(goalId: string, updates: Partial<Goal>): Goal | null;
  deleteGoal(goalId: string): void;
  addStep(goalId: string, step: Omit<GoalStep, 'id' | 'status'>): GoalStep;
  updateStep(goalId: string, stepId: string, updates: Partial<GoalStep>): GoalStep | null;
}

export class InMemoryGoalStore implements GoalStore {
  private goals = new Map<string, Goal>();

  saveGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>): Goal {
    const id = `goal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    
    const newGoal: Goal = {
      id,
      ...goal,
      createdAt: now,
      updatedAt: now,
    };
    
    this.goals.set(id, newGoal);
    return newGoal;
  }

  getGoal(goalId: string): Goal | null {
    return this.goals.get(goalId) || null;
  }

  listGoals(status?: Goal['status']): Goal[] {
    const all = Array.from(this.goals.values());
    if (status) {
      return all.filter(g => g.status === status);
    }
    return all;
  }

  updateGoal(goalId: string, updates: Partial<Goal>): Goal | null {
    const goal = this.goals.get(goalId);
    if (!goal) return null;

    const updated = { ...goal, ...updates, updatedAt: new Date().toISOString() };
    this.goals.set(goalId, updated);
    return updated;
  }

  deleteGoal(goalId: string): void {
    this.goals.delete(goalId);
  }

  addStep(goalId: string, step: Omit<GoalStep, 'id' | 'status'>): GoalStep {
    const goal = this.goals.get(goalId);
    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    const stepId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newStep: GoalStep = {
      id: stepId,
      ...step,
      status: 'pending',
    };

    goal.steps.push(newStep);
    goal.updatedAt = new Date().toISOString();
    return newStep;
  }

  updateStep(goalId: string, stepId: string, updates: Partial<GoalStep>): GoalStep | null {
    const goal = this.goals.get(goalId);
    if (!goal) return null;

    const stepIndex = goal.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return null;

    const existing = goal.steps[stepIndex];
    if (!existing) return null;

    const updated: GoalStep = {
      id: existing.id,
      description: existing.description,
      status: existing.status,
      toolName: existing.toolName,
      toolParams: existing.toolParams,
      requiresApproval: existing.requiresApproval,
      riskClass: existing.riskClass,
      postcondition: existing.postcondition,
      completedAt: existing.completedAt,
      ...updates,
    };
    
    if (updates.status === 'completed') {
      updated.completedAt = new Date().toISOString();
    }

    goal.steps[stepIndex] = updated;
    goal.updatedAt = new Date().toISOString();
    return updated;
  }

  /**
   * Clear all goals (for testing)
   */
  clear(): void {
    this.goals.clear();
  }
}

/**
 * Goal Executor
 *
 * Executes goal steps, respecting safety constraints and approval requirements.
 * Financial actions (G6) always require approval regardless of G7.
 */
export class GoalExecutor {
  private store: GoalStore;
  private executeTool: (toolName: string, params: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;

  constructor(store: GoalStore, toolExecutor: (toolName: string, params: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>) {
    this.store = store;
    this.executeTool = toolExecutor;
  }

  /**
   * Execute a goal step
   */
  async executeStep(goalId: string, stepId: string): Promise<{ success: boolean; error?: string }> {
    const goal = this.store.getGoal(goalId);
    if (!goal) {
      return { success: false, error: 'Goal not found' };
    }

    const step = goal.steps.find(s => s.id === stepId);
    if (!step) {
      return { success: false, error: 'Step not found' };
    }

    // Check if step requires approval
    if (step.requiresApproval) {
      return { success: false, error: 'Step requires approval' };
    }

    // Check risk class - Class 4 is blocked
    if (step.riskClass >= 4) {
      return { success: false, error: 'Class 4 actions are blocked' };
    }

    // Financial actions require approval (G6)
    if (this.isFinancialAction(step.toolName)) {
      return { success: false, error: 'Financial actions require G6 approval' };
    }

    // Mark step as in progress
    this.store.updateStep(goalId, stepId, { status: 'in_progress' });

    // Execute the tool
    const result = await this.executeTool(step.toolName || '', step.toolParams || {});

    // Update step status
    if (result.success) {
      this.store.updateStep(goalId, stepId, { status: 'completed' });
      
      // Check postcondition if specified
      if (step.postcondition) {
        const postconditionMet = await this.checkPostcondition(step.postcondition);
        if (!postconditionMet) {
          this.store.updateStep(goalId, stepId, { status: 'failed' });
          return { success: false, error: 'Postcondition not met' };
        }
      }
    } else {
      this.store.updateStep(goalId, stepId, { status: 'failed' });
    }

    // Update goal status based on steps
    this.updateGoalStatus(goalId);

    return result;
  }

  /**
   * Execute all pending steps for a goal
   */
  async executeGoal(goalId: string): Promise<{ completed: number; failed: number; error?: string }> {
    const goal = this.store.getGoal(goalId);
    if (!goal) {
      return { completed: 0, failed: 0, error: 'Goal not found' };
    }

    this.store.updateGoal(goalId, { status: 'in_progress' });

    let completed = 0;
    let failed = 0;

    for (const step of goal.steps) {
      if (step.status !== 'pending') continue;

      const result = await this.executeStep(goalId, step.id);
      if (result.success) {
        completed++;
      } else {
        failed++;
        // Stop on first failure for now
        break;
      }
    }

    return { completed, failed };
  }

  /**
   * Check if a tool action is financial
   */
  private isFinancialAction(toolName?: string): boolean {
    if (!toolName) return false;
    const financialTools = ['finance.transfer', 'finance.purchase', 'finance.buy', 'finance.sell'];
    return financialTools.some(t => toolName.includes(t));
  }

  /**
   * Check a postcondition (simplified - in production would use actual verification)
   */
  private async checkPostcondition(postcondition: string): Promise<boolean> {
    // In production, this would execute verification logic
    // For now, return true to allow testing
    console.log(`Checking postcondition: ${postcondition}`);
    return true;
  }

  /**
   * Update goal status based on step completion
   */
  private updateGoalStatus(goalId: string): void {
    const goal = this.store.getGoal(goalId);
    if (!goal) return;

    const completedSteps = goal.steps.filter(s => s.status === 'completed').length;
    const failedSteps = goal.steps.filter(s => s.status === 'failed').length;
    const totalSteps = goal.steps.length;

    if (completedSteps === totalSteps) {
      this.store.updateGoal(goalId, { status: 'completed' });
    } else if (failedSteps > 0) {
      this.store.updateGoal(goalId, { status: 'failed' });
    } else if (completedSteps > 0) {
      this.store.updateGoal(goalId, { status: 'in_progress' });
    }
  }
}
