/**
 * Response Cache
 *
 * Caches common responses to reduce latency and provider load.
 * Uses LRU eviction with configurable TTL.
 */

export interface CacheEntry {
  response: string;
  timestamp: number;
  hitCount: number;
}

export class ResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = 100, ttlMs = 5 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from conversation context
   */
  private generateKey(userMessage: string, systemPrompt?: string): string {
    const normalized = userMessage.toLowerCase().trim();
    const system = systemPrompt ? systemPrompt.slice(0, 100) : '';
    return `${system}:${normalized}`;
  }

  /**
   * Get cached response if available and not expired
   */
  get(userMessage: string, systemPrompt?: string): string | null {
    const key = this.generateKey(userMessage, systemPrompt);
    const entry = this.cache.get(key);

    if (!entry) return null;

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    entry.hitCount++;
    return entry.response;
  }

  /**
   * Store response in cache
   */
  set(userMessage: string, response: string, systemPrompt?: string): void {
    const key = this.generateKey(userMessage, systemPrompt);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      let oldestKey: string | null = null;
      let oldestTimestamp = Infinity;

      for (const [k, entry] of this.cache.entries()) {
        if (entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hitCount: 0
    });
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hits: number; entries: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
    }

    return {
      size: this.cache.size,
      hits: totalHits,
      entries: this.cache.size
    };
  }

  /**
   * Remove expired entries
   */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }
}
