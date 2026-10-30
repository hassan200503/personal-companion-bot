/**
 * Core types for OS Automation Framework
 */

import type { UiAutomationSelector as UiaSelector, UiAutomationAction, UiAutomationControl as UiaControl } from '../uia.js';

// Re-export for convenience
export type UiAutomationControl = UiaControl;
export type UiAutomationSelector = UiaSelector;

export interface AutomationContext {
  /** Unique key for this operation (for metrics and circuit breaker) */
  operationKey: string;
  
  /** Target process ID */
  targetProcessId: number;
  
  /** Optional window name for disambiguation */
  windowName?: string;
  
  /** Element selector */
  selector: UiAutomationSelector;
  
  /** Action to perform */
  action: UiAutomationAction;
  
  /** Postcondition checks to verify after action */
  postconditions?: PostconditionCheck[];
  
  /** Timeout for element finding (ms) */
  timeoutMs: number;
  
  /** Timeout for postcondition verification (ms) */
  verificationTimeoutMs?: number;
}

export interface AutomationResult {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** Whether the action was observed to complete */
  observed?: boolean;
  
  /** Return value from action (if applicable) */
  value?: string;
  
  /** Confidence score for element finding (0-1) */
  confidence?: number;
  
  /** Strategy used to locate element */
  strategy?: string;
  
  /** Error message if failed */
  error?: string;
  
  /** Additional error details */
  details?: string;
  
  /** Elapsed time in milliseconds */
  elapsedMs: number;
}

export interface PostconditionCheck {
  /** Type of check to perform */
  type: 'element_exists' | 'element_not_exists' | 'text_matches' | 'property_equals';
  
  /** Element selector for the check */
  selector: UiAutomationSelector;
  
  /** Expected value (for text_matches and property_equals) */
  expected?: string | number | boolean;
  
  /** Timeout for this specific check (ms) */
  timeoutMs: number;
  
  /** Whether this check is required (fail if not satisfied) */
  required: boolean;
}

export interface ElementLocatorStrategy {
  /** Strategy name */
  name: string;
  
  /** Priority (higher = tried first) */
  priority: number;
  
  /** Default timeout for this strategy */
  timeoutMs: number;
  
  /** Whether this strategy can be retried */
  canRetry: boolean;
  
  /** Minimum confidence threshold to accept result */
  minConfidence: number;
}

export interface LocatorResult {
  /** Whether an element was found */
  found: boolean;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Strategy that found the element */
  strategy: string;
  
  /** Resolved selector (may be more specific than input) */
  selector?: UiAutomationSelector;
  
  /** Error if finding failed */
  error?: string;
}

export interface SecurityCheckResult {
  /** Whether the operation is allowed */
  allowed: boolean;
  
  /** Reason for denial (if not allowed) */
  reason?: string;
  
  /** Current process integrity level */
  currentIntegrityLevel?: number;
  
  /** Target process integrity level */
  targetIntegrityLevel?: number;
}

export interface CacheEntry {
  /** Cached selector */
  selector: UiAutomationSelector;
  
  /** When this entry was cached */
  timestamp: number;
  
  /** Number of cache hits */
  hits: number;
}

export interface MetricsSnapshot {
  /** Operation success counts */
  successes: Record<string, number>;
  
  /** Operation failure counts */
  failures: Record<string, number>;
  
  /** Operation latencies (p50, p95, p99) */
  latencies: Record<string, { p50: number; p95: number; p99: number }>;
  
  /** Cache hit rate */
  cacheHitRate: number;
  
  /** Circuit breaker states */
  circuitBreakers: Record<string, 'closed' | 'open' | 'half_open'>;
  
  /** Total operations */
  totalOperations: number;
  
  /** Overall success rate */
  successRate: number;
}

export interface DiagnosticCapture {
  /** When the diagnostic was captured */
  timestamp: string;
  
  /** Operation key */
  operationKey: string;
  
  /** Target process ID */
  targetProcessId: number;
  
  /** Window name */
  windowName?: string;
  
  /** Element selector */
  selector: UiAutomationSelector;
  
  /** Action attempted */
  action: UiAutomationAction;
  
  /** Error that occurred */
  error: {
    message: string;
    stack?: string;
  };
  
  /** UI tree probe result (if available) */
  probe: unknown;
}

export interface RetryableError {
  /** Error name/type */
  name: string;
  
  /** Whether this error should trigger a retry */
  retryable: boolean;
  
  /** Whether this error should count towards circuit breaker */
  countsForCircuitBreaker: boolean;
}

export const RETRYABLE_ERRORS: RetryableError[] = [
  { name: 'TimeoutError', retryable: true, countsForCircuitBreaker: false },
  { name: 'ElementNotFoundException', retryable: true, countsForCircuitBreaker: false },
  { name: 'StaleElementError', retryable: true, countsForCircuitBreaker: false },
  { name: 'NetworkError', retryable: true, countsForCircuitBreaker: false },
  { name: 'ProcessNotFoundError', retryable: false, countsForCircuitBreaker: true },
  { name: 'SecurityError', retryable: false, countsForCircuitBreaker: true },
  { name: 'InvalidArgumentError', retryable: false, countsForCircuitBreaker: true },
];

export class TimeoutError extends Error {
  constructor(message: string, public timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ElementNotFoundException extends Error {
  constructor(message: string, public selector: UiAutomationSelector) {
    super(message);
    this.name = 'ElementNotFoundException';
  }
}

export class StaleElementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleElementError';
  }
}

export class SecurityError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(operationKey: string) {
    super(`Circuit breaker is open for operation: ${operationKey}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class MaxRetriesExceededError extends Error {
  constructor(operationKey: string, public attempts: number, public lastError?: Error) {
    super(`Max retries (${attempts}) exceeded for operation: ${operationKey}`);
    this.name = 'MaxRetriesExceededError';
  }
}
