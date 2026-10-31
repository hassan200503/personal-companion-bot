import { describe, expect, it } from 'vitest';
import { InMemoryGoalStore, GoalExecutor } from './goal-pursuit.js';

describe('GoalStore', () => {
  it('saves and retrieves goals', () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test Goal',
      description: 'Test description',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const retrieved = store.getGoal(goal.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.title).toBe('Test Goal');
  });

  it('lists goals with status filter', () => {
    const store = new InMemoryGoalStore();
    store.saveGoal({
      title: 'Pending Goal',
      description: 'Pending',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });
    store.saveGoal({
      title: 'Completed Goal',
      description: 'Completed',
      priority: 'medium',
      status: 'completed',
      steps: [],
    });

    const pending = store.listGoals('pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.title).toBe('Pending Goal');
  });

  it('updates goals', () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const updated = store.updateGoal(goal.id, { status: 'completed' });
    expect(updated?.status).toBe('completed');
  });

  it('deletes goals', () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    store.deleteGoal(goal.id);
    const retrieved = store.getGoal(goal.id);
    expect(retrieved).toBeNull();
  });

  it('adds steps to goals', () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    store.addStep(goal.id, {
      description: 'Open notepad',
      toolName: 'os.open',
      toolParams: { target: 'notepad' },
      requiresApproval: false,
      riskClass: 2,
    });

    const retrieved = store.getGoal(goal.id);
    expect(retrieved?.steps).toHaveLength(1);
    expect(retrieved?.steps[0]?.description).toBe('Open notepad');
  });

  it('updates steps', () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const step = store.addStep(goal.id, {
      description: 'Open notepad',
      toolName: 'os.open',
      toolParams: { target: 'notepad' },
      requiresApproval: false,
      riskClass: 2,
    });

    const updated = store.updateStep(goal.id, step.id, { status: 'completed' });
    expect(updated?.status).toBe('completed');
  });

  it('clears all goals', () => {
    const store = new InMemoryGoalStore();
    store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    store.clear();
    expect(store.listGoals()).toHaveLength(0);
  });
});

describe('GoalExecutor', () => {
  it('executes steps without approval', async () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const step = store.addStep(goal.id, {
      description: 'Open notepad',
      toolName: 'os.open',
      toolParams: { target: 'notepad' },
      requiresApproval: false,
      riskClass: 2,
    });

    const mockToolExecutor = async () => ({ success: true });
    const executor = new GoalExecutor(store, mockToolExecutor);

    const result = await executor.executeStep(goal.id, step.id);
    expect(result.success).toBe(true);
  });

  it('blocks steps requiring approval', async () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const step = store.addStep(goal.id, {
      description: 'Open notepad',
      toolName: 'os.open',
      toolParams: { target: 'notepad' },
      requiresApproval: true,
      riskClass: 2,
    });

    const mockToolExecutor = async () => ({ success: true });
    const executor = new GoalExecutor(store, mockToolExecutor);

    const result = await executor.executeStep(goal.id, step.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain('requires approval');
  });

  it('blocks Class 4 actions', async () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const step = store.addStep(goal.id, {
      description: 'Dangerous action',
      toolName: 'dangerous.tool',
      toolParams: {},
      requiresApproval: false,
      riskClass: 4,
    });

    const mockToolExecutor = async () => ({ success: true });
    const executor = new GoalExecutor(store, mockToolExecutor);

    const result = await executor.executeStep(goal.id, step.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Class 4');
  });

  it('blocks financial actions without G6 approval', async () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const step = store.addStep(goal.id, {
      description: 'Transfer money',
      toolName: 'finance.transfer',
      toolParams: { amount: 100 },
      requiresApproval: false,
      riskClass: 3,
    });

    const mockToolExecutor = async () => ({ success: true });
    const executor = new GoalExecutor(store, mockToolExecutor);

    const result = await executor.executeStep(goal.id, step.id);
    expect(result.success).toBe(false);
    expect(result.error).toContain('G6 approval');
  });

  it('updates goal status on completion', async () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const step = store.addStep(goal.id, {
      description: 'Open notepad',
      toolName: 'os.open',
      toolParams: { target: 'notepad' },
      requiresApproval: false,
      riskClass: 2,
    });

    const mockToolExecutor = async () => ({ success: true });
    const executor = new GoalExecutor(store, mockToolExecutor);

    await executor.executeStep(goal.id, step.id);
    const updated = store.getGoal(goal.id);
    expect(updated?.status).toBe('completed');
  });

  it('executes multiple steps', async () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    store.addStep(goal.id, {
      description: 'Step 1',
      toolName: 'os.open',
      toolParams: { target: 'notepad' },
      requiresApproval: false,
      riskClass: 2,
    });

    store.addStep(goal.id, {
      description: 'Step 2',
      toolName: 'os.speak',
      toolParams: { text: 'Hello' },
      requiresApproval: false,
      riskClass: 1,
    });

    const mockToolExecutor = async () => ({ success: true });
    const executor = new GoalExecutor(store, mockToolExecutor);

    const result = await executor.executeGoal(goal.id);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('handles tool execution failure', async () => {
    const store = new InMemoryGoalStore();
    const goal = store.saveGoal({
      title: 'Test',
      description: 'Test',
      priority: 'medium',
      status: 'pending',
      steps: [],
    });

    const step = store.addStep(goal.id, {
      description: 'Open notepad',
      toolName: 'os.open',
      toolParams: { target: 'notepad' },
      requiresApproval: false,
      riskClass: 2,
    });

    const mockToolExecutor = async () => ({ success: false, error: 'Tool failed' });
    const executor = new GoalExecutor(store, mockToolExecutor);

    const result = await executor.executeStep(goal.id, step.id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Tool failed');
  });
});
