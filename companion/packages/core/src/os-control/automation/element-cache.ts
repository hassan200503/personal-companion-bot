/**
 * Element Cache for Performance Optimization
 * 
 * L1 in-memory cache with TTL-based expiration
 */

import type { UiAutomationSelector, CacheEntry } from './types.js';

export class ElementCache {
  private cache: Map<string, CacheEntry> = new Map();
  
  constructor(private ttlMs: number = 5000) {}
  
  /**
   * Get cached element selector
   */
  get(processId: number, selector: UiAutomationSelector): UiAutomationSelector | null {
    const key = this.computeKey(processId, selector);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    entry.hits++;
    return entry.selector;
  }
  
  /**
   * Cache an element selector
   */
  set(processId: number, originalSelector: UiAutomationSelector, resolvedSelector: UiAutomationSelector): void {
    const key = this.computeKey(processId, originalSelector);
    
    this.cache.set(key, {
      selector: resolvedSelector,
      timestamp: Date.now(),
      hits: 0
    });
  }
  
  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Remove expired entries
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        evicted++;
      }
    }
    
    return evicted;
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }
    
    const size = this.cache.size;
    const hitRate = size > 0 ? totalHits / size : 0;
    
    return { size, hitRate };
  }
  
  /**
   * Compute cache key
   */
  private computeKey(processId: number, selector: UiAutomationSelector): string {
    return `${processId}:${selector.automationId ?? ''}:${selector.name ?? ''}:${selector.controlType ?? ''}`;
  }
}
