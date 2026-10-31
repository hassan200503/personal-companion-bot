import { describe, expect, it } from 'vitest';
import { InMemoryFinancialStore, FinancialGuard } from './financial.js';

describe('FinancialStore', () => {
  it('saves and retrieves budgets', () => {
    const store = new InMemoryFinancialStore();
    const budget = store.saveBudget({
      name: 'Monthly Budget',
      limit: 1000,
      currency: 'USD',
      period: 'monthly',
    });

    const retrieved = store.getBudget(budget.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.name).toBe('Monthly Budget');
  });

  it('lists budgets', () => {
    const store = new InMemoryFinancialStore();
    store.saveBudget({
      name: 'Budget 1',
      limit: 100,
      currency: 'USD',
      period: 'daily',
    });
    store.saveBudget({
      name: 'Budget 2',
      limit: 200,
      currency: 'USD',
      period: 'weekly',
    });

    const budgets = store.listBudgets();
    expect(budgets).toHaveLength(2);
  });

  it('updates budgets', () => {
    const store = new InMemoryFinancialStore();
    const budget = store.saveBudget({
      name: 'Test',
      limit: 100,
      currency: 'USD',
      period: 'daily',
    });

    const updated = store.updateBudget(budget.id, { spent: 50 });
    expect(updated?.spent).toBe(50);
  });

  it('deletes budgets', () => {
    const store = new InMemoryFinancialStore();
    const budget = store.saveBudget({
      name: 'Test',
      limit: 100,
      currency: 'USD',
      period: 'daily',
    });

    store.deleteBudget(budget.id);
    const retrieved = store.getBudget(budget.id);
    expect(retrieved).toBeNull();
  });

  it('saves and retrieves transactions', () => {
    const store = new InMemoryFinancialStore();
    const transaction = store.saveTransaction({
      budgetId: 'budget_1',
      amount: 50,
      currency: 'USD',
      description: 'Test purchase',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });

    const retrieved = store.getTransaction(transaction.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved?.description).toBe('Test purchase');
  });

  it('lists transactions by budget', () => {
    const store = new InMemoryFinancialStore();
    store.saveTransaction({
      budgetId: 'budget_1',
      amount: 50,
      currency: 'USD',
      description: 'Transaction 1',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });
    store.saveTransaction({
      budgetId: 'budget_2',
      amount: 100,
      currency: 'USD',
      description: 'Transaction 2',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });

    const budget1Txns = store.listTransactions('budget_1');
    expect(budget1Txns).toHaveLength(1);
  });

  it('approves transactions', () => {
    const store = new InMemoryFinancialStore();
    const transaction = store.saveTransaction({
      budgetId: 'budget_1',
      amount: 50,
      currency: 'USD',
      description: 'Test',
      type: 'expense',
      status: 'pending',
      requiresApproval: true,
      riskClass: 3,
    });

    const approved = store.approveTransaction(transaction.id);
    expect(approved?.status).toBe('approved');
    expect(approved?.approvedAt).toBeTruthy();
  });

  it('rejects transactions', () => {
    const store = new InMemoryFinancialStore();
    const transaction = store.saveTransaction({
      budgetId: 'budget_1',
      amount: 50,
      currency: 'USD',
      description: 'Test',
      type: 'expense',
      status: 'pending',
      requiresApproval: true,
      riskClass: 3,
    });

    const rejected = store.rejectTransaction(transaction.id);
    expect(rejected?.status).toBe('rejected');
  });

  it('clears all data', () => {
    const store = new InMemoryFinancialStore();
    store.saveBudget({
      name: 'Test',
      limit: 100,
      currency: 'USD',
      period: 'daily',
    });

    store.clear();
    expect(store.listBudgets()).toHaveLength(0);
    expect(store.listTransactions()).toHaveLength(0);
  });
});

describe('FinancialGuard', () => {
  it('allows transactions within limits', () => {
    const store = new InMemoryFinancialStore();
    const config = {
      maxDailySpend: 1000,
      maxTransactionAmount: 500,
      requireApprovalThreshold: 100,
      simulationMode: false,
    };
    const guard = new FinancialGuard(store, config);

    const budget = store.saveBudget({
      name: 'Test Budget',
      limit: 1000,
      currency: 'USD',
      period: 'monthly',
    });

    const check = guard.checkTransaction({
      budgetId: budget.id,
      amount: 50,
      currency: 'USD',
      description: 'Test',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });

    expect(check.allowed).toBe(true);
  });

  it('blocks transactions exceeding max amount', () => {
    const store = new InMemoryFinancialStore();
    const config = {
      maxDailySpend: 1000,
      maxTransactionAmount: 500,
      requireApprovalThreshold: 100,
      simulationMode: false,
    };
    const guard = new FinancialGuard(store, config);

    const check = guard.checkTransaction({
      budgetId: 'budget_1',
      amount: 1000,
      currency: 'USD',
      description: 'Large purchase',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('exceeds maximum amount');
  });

  it('blocks transactions exceeding budget', () => {
    const store = new InMemoryFinancialStore();
    const config = {
      maxDailySpend: 1000,
      maxTransactionAmount: 500,
      requireApprovalThreshold: 100,
      simulationMode: false,
    };
    const guard = new FinancialGuard(store, config);

    const budget = store.saveBudget({
      name: 'Test Budget',
      limit: 100,
      currency: 'USD',
      period: 'monthly',
    });

    store.updateBudget(budget.id, { spent: 80 });

    const check = guard.checkTransaction({
      budgetId: budget.id,
      amount: 50,
      currency: 'USD',
      description: 'Test',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Budget limit exceeded');
  });

  it('executes transactions in simulation mode', async () => {
    const store = new InMemoryFinancialStore();
    const config = {
      maxDailySpend: 1000,
      maxTransactionAmount: 500,
      requireApprovalThreshold: 100,
      simulationMode: true,
    };
    const guard = new FinancialGuard(store, config);

    const budget = store.saveBudget({
      name: 'Test Budget',
      limit: 1000,
      currency: 'USD',
      period: 'monthly',
    });

    const result = await guard.executeTransaction({
      budgetId: budget.id,
      amount: 50,
      currency: 'USD',
      description: 'Test',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });

    expect(result.success).toBe(true);
    expect(result.error).toContain('Simulation');
  });

  it('requires approval for pending transactions', async () => {
    const store = new InMemoryFinancialStore();
    const config = {
      maxDailySpend: 1000,
      maxTransactionAmount: 500,
      requireApprovalThreshold: 100,
      simulationMode: false,
    };
    const guard = new FinancialGuard(store, config);

    const budget = store.saveBudget({
      name: 'Test Budget',
      limit: 1000,
      currency: 'USD',
      period: 'monthly',
    });

    const result = await guard.executeTransaction({
      budgetId: budget.id,
      amount: 150,
      currency: 'USD',
      description: 'Large purchase',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Approval required');
    expect(result.transaction?.status).toBe('pending');
  });

  it('updates budget spent amount on execution', async () => {
    const store = new InMemoryFinancialStore();
    const config = {
      maxDailySpend: 1000,
      maxTransactionAmount: 500,
      requireApprovalThreshold: 100,
      simulationMode: false,
    };
    const guard = new FinancialGuard(store, config);

    const budget = store.saveBudget({
      name: 'Test Budget',
      limit: 1000,
      currency: 'USD',
      period: 'monthly',
    });

    await guard.executeTransaction({
      budgetId: budget.id,
      amount: 50,
      currency: 'USD',
      description: 'Test',
      type: 'expense',
      requiresApproval: false,
      riskClass: 2,
    });

    const updated = store.getBudget(budget.id);
    expect(updated?.spent).toBe(50);
  });

  it('calculates remaining budget', () => {
    const store = new InMemoryFinancialStore();
    const config = {
      maxDailySpend: 1000,
      maxTransactionAmount: 500,
      requireApprovalThreshold: 100,
      simulationMode: false,
    };
    const guard = new FinancialGuard(store, config);

    const budget = store.saveBudget({
      name: 'Test Budget',
      limit: 1000,
      currency: 'USD',
      period: 'monthly',
    });

    store.updateBudget(budget.id, { spent: 300 });

    const remaining = guard.getRemainingBudget(budget.id);
    expect(remaining).toBe(700);
  });

  it('checks daily spend limit', () => {
    const store = new InMemoryFinancialStore();
    const config = {
      maxDailySpend: 1000,
      maxTransactionAmount: 500,
      requireApprovalThreshold: 100,
      simulationMode: false,
    };
    const guard = new FinancialGuard(store, config);

    const check = guard.checkDailySpend();
    expect(check.withinLimit).toBe(true);
    expect(check.spent).toBe(0);
    expect(check.limit).toBe(1000);
  });
});
