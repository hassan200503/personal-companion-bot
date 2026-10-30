/**
 * Circuit Breaker Pattern
 * 
 * Prevents cascading failures by "opening" after too many failures,
 * temporarily rejecting requests to allow the system to recover.
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests are rejected immediately
 * - HALF_OPEN: Testing if system has recovered
 */

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  
  /** Time to wait before attempting to close the circuit (ms) */
  resetTimeoutMs: number;
  
  /** Number of successful requests needed in HALF_OPEN to close */
  halfOpenMaxAttempts?: number;
}

export type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitStatus {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastStateChange: number;
}

export class CircuitBreaker {
  private circuits: Map<string, CircuitStatus> = new Map();
  private readonly halfOpenMaxAttempts: number;
  
  constructor(private config: CircuitBreakerConfig) {
    this.halfOpenMaxAttempts = config.halfOpenMaxAttempts ?? 1;
  }
  
  /**
   * Check if the circuit is open for a given operation
   */
  isOpen(operationKey: string): boolean {
    const status = this.getOrCreateStatus(operationKey);
    
    // If circuit is open, check if reset timeout has passed
    if (status.state === 'open') {
      const now = Date.now();
      if (status.lastFailureTime && 
          now - status.lastFailureTime >= this.config.resetTimeoutMs) {
        // Transition to HALF_OPEN to test recovery
        this.transitionTo(operationKey, 'half_open');
        return false;
      }
      return true;
    }
    
    return false;
  }
  
  /**
   * Record a successful operation
   */
  recordSuccess(operationKey: string): void {
    const status = this.getOrCreateStatus(operationKey);
    
    switch (status.state) {
      case 'closed':
        // Reset failure count on success in closed state
        status.failureCount = 0;
        break;
        
      case 'half_open':
        // Count successes in half-open state
        status.successCount++;
        
        // If enough successes, close the circuit
        if (status.successCount >= this.halfOpenMaxAttempts) {
          this.transitionTo(operationKey, 'closed');
        }
        break;
        
      case 'open':
        // Should not receive success in open state (but handle gracefully)
        console.warn(
          `[CircuitBreaker] Received success for "${operationKey}" in OPEN state`
        );
        break;
    }
  }
  
  /**
   * Record a failed operation
   */
  recordFailure(operationKey: string): void {
    const status = this.getOrCreateStatus(operationKey);
    const now = Date.now();
    
    status.failureCount++;
    status.lastFailureTime = now;
    
    switch (status.state) {
      case 'closed':
        // Check if we've hit the failure threshold
        if (status.failureCount >= this.config.failureThreshold) {
          this.transitionTo(operationKey, 'open');
        }
        break;
        
      case 'half_open':
        // Any failure in half-open immediately opens the circuit
        this.transitionTo(operationKey, 'open');
        break;
        
      case 'open':
        // Already open, just record the failure
        break;
    }
  }
  
  /**
   * Get current state for an operation
   */
  getState(operationKey: string): CircuitState {
    return this.getOrCreateStatus(operationKey).state;
  }
  
  /**
   * Get all circuit states (for monitoring)
   */
  getAllStates(): Record<string, CircuitState> {
    const result: Record<string, CircuitState> = {};
    for (const [key, status] of this.circuits.entries()) {
      result[key] = status.state;
    }
    return result;
  }
  
  /**
   * Manually reset a circuit (for administrative intervention)
   */
  reset(operationKey: string): void {
    const status = this.getOrCreateStatus(operationKey);
    status.failureCount = 0;
    status.successCount = 0;
    status.lastFailureTime = null;
    this.transitionTo(operationKey, 'closed');
    
    console.log(`[CircuitBreaker] Manually reset circuit for "${operationKey}"`);
  }
  
  /**
   * Reset all circuits (for testing or administrative intervention)
   */
  resetAll(): void {
    for (const key of this.circuits.keys()) {
      this.reset(key);
    }
  }
  
  /**
   * Get or create status for an operation
   */
  private getOrCreateStatus(operationKey: string): CircuitStatus {
    let status = this.circuits.get(operationKey);
    
    if (!status) {
      status = {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailureTime: null,
        lastStateChange: Date.now()
      };
      this.circuits.set(operationKey, status);
    }
    
    return status;
  }
  
  /**
   * Transition circuit to a new state
   */
  private transitionTo(operationKey: string, newState: CircuitState): void {
    const status = this.circuits.get(operationKey);
    if (!status) return;
    
    const oldState = status.state;
    if (oldState === newState) return;
    
    status.state = newState;
    status.lastStateChange = Date.now();
    
    // Reset counters on state transition
    if (newState === 'closed') {
      status.failureCount = 0;
      status.successCount = 0;
      status.lastFailureTime = null;
    } else if (newState === 'half_open') {
      status.successCount = 0;
      // Keep failure count and lastFailureTime for history
    }
    
    console.log(
      `[CircuitBreaker] "${operationKey}" transitioned from ${oldState.toUpperCase()} ` +
      `to ${newState.toUpperCase()} (failures: ${status.failureCount})`
    );
  }
  
  /**
   * Get statistics for monitoring
   */
  getStatistics(operationKey: string): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    timeSinceLastFailure: number | null;
    timeSinceStateChange: number;
  } {
    const status = this.getOrCreateStatus(operationKey);
    const now = Date.now();
    
    return {
      state: status.state,
      failureCount: status.failureCount,
      successCount: status.successCount,
      timeSinceLastFailure: status.lastFailureTime 
        ? now - status.lastFailureTime 
        : null,
      timeSinceStateChange: now - status.lastStateChange
    };
  }
}

/**
 * Default circuit breaker configuration for production
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,     // Open after 5 failures
  resetTimeoutMs: 60000,   // Try recovery after 1 minute
  halfOpenMaxAttempts: 1,  // Close after 1 successful test
};

/**
 * Aggressive configuration for critical paths
 */
export const AGGRESSIVE_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,     // Open after 3 failures
  resetTimeoutMs: 30000,   // Try recovery after 30 seconds
  halfOpenMaxAttempts: 2,  // Require 2 successes to close
};

/**
 * Conservative configuration for non-critical operations
 */
export const CONSERVATIVE_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 10,    // Open after 10 failures
  resetTimeoutMs: 120000,  // Try recovery after 2 minutes
  halfOpenMaxAttempts: 1,
};
