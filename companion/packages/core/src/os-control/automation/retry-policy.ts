/**
 * Retry Policy with Exponential Backoff
 * 
 * Implements intelligent retry logic with:
 * - Exponential backoff to reduce load during transient failures
 * - Jitter to prevent thundering herd problem
 * - Error classification (retryable vs non-retryable)
 * - Metrics collection for adaptive timeouts
 */

import { RETRYABLE_ERRORS, MaxRetriesExceededError } from './types.js';

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  
  /** Base delay between retries (ms) */
  baseDelayMs: number;
  
  /** Maximum delay between retries (ms) */
  maxDelayMs: number;
  
  /** Backoff multiplier (typically 2 for exponential) */
  backoffMultiplier: number;
  
  /** Jitter percentage (0-100) to add randomness */
  jitterPercent: number;
  
  /** List of error types that should trigger retry */
  retryableErrors?: string[];
}

export class RetryPolicy {
  private readonly retryableErrorNames: Set<string>;
  
  constructor(private config: RetryConfig) {
    // Build set of retryable error names from config or defaults
    this.retryableErrorNames = new Set(
      config.retryableErrors ?? RETRYABLE_ERRORS
        .filter(e => e.retryable)
        .map(e => e.name)
    );
  }
  
  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationKey: string
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        // Execute the operation
        const result = await operation();
        
        // Success - return result
        if (attempt > 1) {
          // Log successful retry
          console.debug(
            `[RetryPolicy] Operation "${operationKey}" succeeded on attempt ${attempt}/${this.config.maxAttempts}`
          );
        }
        
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable
        if (!this.isRetryable(lastError)) {
          console.debug(
            `[RetryPolicy] Non-retryable error for "${operationKey}": ${lastError.name}`
          );
          throw lastError;
        }
        
        // Last attempt - don't delay, just throw
        if (attempt === this.config.maxAttempts) {
          break;
        }
        
        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);
        
        console.debug(
          `[RetryPolicy] Attempt ${attempt}/${this.config.maxAttempts} failed for "${operationKey}": ` +
          `${lastError.message}. Retrying in ${delay}ms...`
        );
        
        // Wait before retry
        await this.sleep(delay);
      }
    }
    
    // All attempts exhausted
    throw new MaxRetriesExceededError(
      operationKey,
      this.config.maxAttempts,
      lastError ?? undefined
    );
  }
  
  /**
   * Check if an error should trigger a retry
   */
  private isRetryable(error: Error): boolean {
    return this.retryableErrorNames.has(error.name) ||
           this.retryableErrorNames.has(error.constructor.name);
  }
  
  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (multiplier ^ (attempt - 1))
    const exponential = Math.min(
      this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
      this.config.maxDelayMs
    );
    
    // Add jitter to prevent thundering herd
    // Jitter is ±jitterPercent% of the exponential delay
    const jitterRange = exponential * (this.config.jitterPercent / 100);
    const jitterAmount = (Math.random() * 2 - 1) * jitterRange;
    
    const finalDelay = Math.round(exponential + jitterAmount);
    
    // Ensure delay is positive and within bounds
    return Math.max(
      this.config.baseDelayMs,
      Math.min(finalDelay, this.config.maxDelayMs)
    );
  }
  
  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get current configuration
   */
  getConfig(): Readonly<RetryConfig> {
    return Object.freeze({ ...this.config });
  }
  
  /**
   * Update configuration (useful for adaptive tuning)
   */
  updateConfig(updates: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Rebuild retryable error set if it changed
    if (updates.retryableErrors) {
      this.retryableErrorNames.clear();
      updates.retryableErrors.forEach(name => this.retryableErrorNames.add(name));
    }
  }
}

/**
 * Default retry configuration for production use
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,     // 1 second
  maxDelayMs: 8000,      // 8 seconds
  backoffMultiplier: 2,  // 1s -> 2s -> 4s -> 8s
  jitterPercent: 30,     // ±30% randomness
};

/**
 * Aggressive retry configuration for critical operations
 */
export const AGGRESSIVE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterPercent: 20,
};

/**
 * Conservative retry configuration for expensive operations
 */
export const CONSERVATIVE_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 2,
  baseDelayMs: 2000,
  maxDelayMs: 5000,
  backoffMultiplier: 1.5,
  jitterPercent: 40,
};
