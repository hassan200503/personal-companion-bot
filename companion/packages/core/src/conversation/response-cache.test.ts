import { describe, expect, it } from 'vitest';
import { ResponseCache } from './response-cache.js';

describe('ResponseCache', () => {
  it('caches and retrieves responses', () => {
    const cache = new ResponseCache(10, 1000);
    cache.set('hello', 'Hi there!', 'System prompt');
    expect(cache.get('hello', 'System prompt')).toBe('Hi there!');
  });

  it('returns null for cache miss', () => {
    const cache = new ResponseCache(10, 1000);
    expect(cache.get('unknown', 'System prompt')).toBeNull();
  });

  it('normalizes keys (case-insensitive)', () => {
    const cache = new ResponseCache(10, 1000);
    cache.set('Hello World', 'Response', 'System');
    expect(cache.get('hello world', 'System')).toBe('Response');
  });

  it('evicts oldest entries when at capacity', () => {
    const cache = new ResponseCache(3, 1000);
    cache.set('a', 'A', 'System');
    cache.set('b', 'B', 'System');
    cache.set('c', 'C', 'System');
    cache.set('d', 'D', 'System'); // Should evict 'a'
    expect(cache.get('a', 'System')).toBeNull();
    expect(cache.get('b', 'System')).toBe('B');
    expect(cache.get('c', 'System')).toBe('C');
    expect(cache.get('d', 'System')).toBe('D');
  });

  it('expires entries after TTL', () => {
    const cache = new ResponseCache(10, 100); // 100ms TTL
    cache.set('test', 'Response', 'System');
    expect(cache.get('test', 'System')).toBe('Response');
    // Wait for expiration
    return new Promise(resolve => setTimeout(resolve, 150)).then(() => {
      expect(cache.get('test', 'System')).toBeNull();
    });
  });

  it('tracks hit count', () => {
    const cache = new ResponseCache(10, 1000);
    cache.set('test', 'Response', 'System');
    cache.get('test', 'System');
    cache.get('test', 'System');
    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
  });

  it('clears all entries', () => {
    const cache = new ResponseCache(10, 1000);
    cache.set('a', 'A', 'System');
    cache.set('b', 'B', 'System');
    cache.clear();
    expect(cache.get('a', 'System')).toBeNull();
    expect(cache.get('b', 'System')).toBeNull();
  });

  it('prunes expired entries', () => {
    const cache = new ResponseCache(10, 100);
    cache.set('a', 'A', 'System');
    cache.set('b', 'B', 'System');
    return new Promise(resolve => setTimeout(resolve, 150)).then(() => {
      cache.prune();
      expect(cache.getStats().size).toBe(0);
    });
  });
});
