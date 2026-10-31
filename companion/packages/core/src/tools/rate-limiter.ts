/**
 * Sliding-window rate limiter for tool execution.
 * Prevents abuse and runaway LLM loops.
 */

export interface RateLimitConfig {
  /** Maximum calls per window */
  maxCalls: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimiter {
  /**
   * Check if the operation is allowed and record it if so.
   * @param key - Unique key for the operation (e.g., "user:tool")
   * @param limit - Maximum calls per window
   * @param windowMs - Window duration in milliseconds
   * @returns true if allowed, false if rate-limited
   */
  allow(key: string, limit: number, windowMs: number): boolean;
  
  /**
   * Reset all rate limits (for testing).
   */
  reset(): void;
}

interface CallRecord {
  timestamps: number[];
  limit: number;
  windowMs: number;
}

/**
 * Sliding window rate limiter using in-memory timestamp tracking.
 * 
 * Example:
 * ```typescript
 * const limiter = new SlidingWindowRateLimiter();
 * if (limiter.allow('user:os.run', 10, 60_000)) {
 *   await executeTool();
 * } else {
 *   throw new Error('Rate limit exceeded');
 * }
 * ```
 */
export class SlidingWindowRateLimiter implements RateLimiter {
  private calls = new Map<string, CallRecord>();
  
  allow(key: string, limit: number, windowMs: number): boolean {
    if (limit <= 0) return false;
    if (windowMs <= 0) return false;
    
    const now = Date.now();
    const cutoff = now - windowMs;
    
    const record = this.calls.get(key);
    if (!record) {
      // First call for this key
      this.calls.set(key, { timestamps: [now], limit, windowMs });
      return true;
    }
    
    // Remove expired timestamps
    record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
    
    if (record.timestamps.length >= limit) {
      return false;
    }
    
    // Allow and record
    record.timestamps.push(now);
    record.limit = limit;
    record.windowMs = windowMs;
    return true;
  }
  
  reset(): void {
    this.calls.clear();
  }
}

/**
 * Default rate limit configurations by risk class.
 */
export const DEFAULT_RATE_LIMITS: Record<number, RateLimitConfig> = {
  1: { maxCalls: 50, windowMs: 60_000 },  // Class 1: 50/min (read-only, low risk)
  2: { maxCalls: 20, windowMs: 60_000 },  // Class 2: 20/min (write, medium risk)
  3: { maxCalls: 5, windowMs: 60_000 },   // Class 3: 5/min (high risk, requires confirmation)
  4: { maxCalls: 0, windowMs: 60_000 },   // Class 4: never allowed
};
