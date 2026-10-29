import { randomUUID } from 'node:crypto';
import type { ConfirmationManager, PendingConfirmation } from './contracts.js';

export class InMemoryConfirmationManager implements ConfirmationManager {
  private readonly pending = new Map<string, PendingConfirmation>();

  createPending(toolName: string, toolVersion: string, input: unknown, ttlMs = 5 * 60 * 1000): PendingConfirmation {
    const actionHash = randomUUID();
    const now = new Date();
    const pending: PendingConfirmation = {
      actionHash,
      toolName,
      toolVersion,
      input,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      consumed: false,
    };
    this.pending.set(actionHash, pending);
    return pending;
  }

  get(actionHash: string): PendingConfirmation | null {
    const p = this.pending.get(actionHash) ?? null;
    if (!p) return null;
    if (new Date(p.expiresAt).getTime() < Date.now()) return null;
    return p;
  }

  confirm(actionHash: string): boolean {
    const p = this.get(actionHash);
    if (!p || p.consumed) return false;
    (p as PendingConfirmation & { confirmed?: boolean }).confirmed = true;
    return true;
  }

  reject(actionHash: string): boolean {
    const p = this.pending.get(actionHash);
    if (!p) return false;
    this.pending.delete(actionHash);
    return true;
  }

  isConfirmed(actionHash: string): boolean {
    const p = this.get(actionHash);
    return !!p && (p as PendingConfirmation & { confirmed?: boolean }).confirmed === true && !p.consumed;
  }

  markConsumed(actionHash: string): void {
    const p = this.pending.get(actionHash);
    if (p) {
      p.consumed = true;
      (p as PendingConfirmation & { confirmed?: boolean }).confirmed = false;
    }
  }

  rejectAll(): number {
    const count = this.pending.size;
    this.pending.clear();
    return count;
  }
}

