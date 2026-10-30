/**
 * Metrics Collector
 * 
 * Tracks performance and reliability metrics
 */

import type { MetricsSnapshot, DiagnosticCapture } from './types.js';

interface OperationMetrics {
  successes: number;
  failures: number;
  latencies: number[];
}

export class MetricsCollector {
  private operations: Map<string, OperationMetrics> = new Map();
  private diagnostics: DiagnosticCapture[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  
  /**
   * Record successful operation
   */
  recordSuccess(operationKey: string, latencyMs: number): void {
    const metrics = this.getOrCreateMetrics(operationKey);
    metrics.successes++;
    metrics.latencies.push(latencyMs);
    
    // Keep only last 100 latencies for percentile calculation
    if (metrics.latencies.length > 100) {
      metrics.latencies.shift();
    }
  }
  
  /**
   * Record failed operation
   */
  recordFailure(operationKey: string, latencyMs: number, _error: unknown): void {
    const metrics = this.getOrCreateMetrics(operationKey);
    metrics.failures++;
    metrics.latencies.push(latencyMs);
    
    if (metrics.latencies.length > 100) {
      metrics.latencies.shift();
    }
  }
  
  /**
   * Record cache hit
   */
  recordCacheHit(_cacheType: string): void {
    this.cacheHits++;
  }
  
  /**
   * Record cache miss
   */
  recordCacheMiss(_cacheType: string): void {
    this.cacheMisses++;
  }
  
  /**
   * Record diagnostic capture
   */
  recordDiagnostics(diagnostic: DiagnosticCapture): void {
    this.diagnostics.push(diagnostic);
    
    // Keep only last 50 diagnostics
    if (this.diagnostics.length > 50) {
      this.diagnostics.shift();
    }
  }
  
  /**
   * Get metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const successes: Record<string, number> = {};
    const failures: Record<string, number> = {};
    const latencies: Record<string, { p50: number; p95: number; p99: number }> = {};
    
    let totalOps = 0;
    let totalSuccesses = 0;
    
    for (const [key, metrics] of this.operations.entries()) {
      successes[key] = metrics.successes;
      failures[key] = metrics.failures;
      latencies[key] = this.calculatePercentiles(metrics.latencies);
      
      totalOps += metrics.successes + metrics.failures;
      totalSuccesses += metrics.successes;
    }
    
    const totalCache = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCache > 0 ? this.cacheHits / totalCache : 0;
    
    return {
      successes,
      failures,
      latencies,
      cacheHitRate,
      circuitBreakers: {}, // Populated by CircuitBreaker
      totalOperations: totalOps,
      successRate: totalOps > 0 ? totalSuccesses / totalOps : 0
    };
  }
  
  /**
   * Get or create metrics for an operation
   */
  private getOrCreateMetrics(operationKey: string): OperationMetrics {
    let metrics = this.operations.get(operationKey);
    
    if (!metrics) {
      metrics = {
        successes: 0,
        failures: 0,
        latencies: []
      };
      this.operations.set(operationKey, metrics);
    }
    
    return metrics;
  }
  
  /**
   * Calculate latency percentiles
   */
  private calculatePercentiles(latencies: number[]): { p50: number; p95: number; p99: number } {
    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...latencies].sort((a, b) => a - b);
    
    return {
      p50: this.percentile(sorted, 0.50),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99)
    };
  }
  
  /**
   * Calculate specific percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.operations.clear();
    this.diagnostics = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}
