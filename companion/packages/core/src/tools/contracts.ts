/**
 * Tool registry, policy engine, confirmation and audit contracts (M7)
 */

import { z } from 'zod';
import type { MemoryRepository } from '../memory/contracts.js';

export type RiskClass = 1 | 2 | 3 | 4;
export type DataClassification = 'public' | 'personal' | 'sensitive' | 'secret';
export type AuditLevel = 'none' | 'metadata' | 'full';
export type TrustLevel = 'trusted' | 'untrusted';

export interface RateLimiter {
  allow(key: string, limit: number, windowMs: number): boolean;
}

export interface AuditEvent {
  id?: number;
  action: string;
  outcome: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogger {
  record(event: AuditEvent): void;
  list(limit?: number): AuditEvent[];
}

export interface PendingConfirmation {
  actionHash: string;
  toolName: string;
  toolVersion: string;
  input: unknown;
  createdAt: string;
  expiresAt: string;
  consumed: boolean;
}

export interface ConfirmationManager {
  createPending(toolName: string, toolVersion: string, input: unknown, ttlMs?: number): PendingConfirmation;
  get(actionHash: string): PendingConfirmation | null;
  confirm(actionHash: string): boolean;
  reject(actionHash: string): boolean;
  isConfirmed(actionHash: string): boolean;
  markConsumed(actionHash: string): void;
}

export interface ToolExecutionContext {
  signal: AbortSignal;
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void; error?: (...a: unknown[]) => void };
  platform: string;
  permissions: Set<string>;
  allowLists?: Record<string, string[]>;
  allowListChecker?: (toolName: string, input: unknown) => { ok: boolean; reason?: string };
  rateLimiter?: RateLimiter;
  audit: AuditLogger;
  confirmation: ConfirmationManager;
  memoryRepository?: MemoryRepository;
  draftStore?: { create(title: string, content: string): string; list(): { id: string; title: string; content: string }[] };
  now: () => Date;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  version: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  requiredPermissions: string[];
  dataClassification: DataClassification;
  riskClass: RiskClass;
  reversible: boolean;
  requiresConfirmation?: boolean;
  timeoutMs: number;
  cancellable: boolean;
  audit: AuditLevel;
  platforms: string[];
  execute: (ctx: ToolExecutionContext, input: TInput) => Promise<TOutput>;
}

export interface ToolCallRequest {
  toolName: string;
  toolVersion?: string;
  input: unknown;
  trust: TrustLevel;
  confirmationHash?: string;
  requestedBy?: string;
}

export interface ToolPolicyDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  actionHash?: string;
}

export interface ToolRegistry {
  register(tool: ToolDefinition<unknown, unknown>): void;
  unregister(name: string, version?: string): void;
  get(name: string, version?: string): ToolDefinition<unknown, unknown> | null;
  list(): ToolDefinition<unknown, unknown>[];
}

export interface PolicyEngine {
  evaluate(request: ToolCallRequest, tool: ToolDefinition<unknown, unknown>, ctx: ToolExecutionContext): ToolPolicyDecision;
}

export interface ToolExecutionResult {
  status: 'completed' | 'denied' | 'needs_confirmation' | 'failed' | 'duplicate';
  result?: unknown;
  actionHash?: string;
  error?: string;
}

export interface ToolExecutor {
  execute(request: ToolCallRequest, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
}