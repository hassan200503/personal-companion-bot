import { describe, it, expect, beforeEach } from 'vitest';
import { SlidingWindowRateLimiter, DEFAULT_RATE_LIMITS } from './rate-limiter.js';

describe('SlidingWindowRateLimiter', () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter();
  });

  it('allows calls below the limit', () => {
    expect(limiter.allow('test', 3, 1000)).toBe(true);
    expect(limiter.allow('test', 3, 1000)).toBe(true);
    expect(limiter.allow('test', 3, 1000)).toBe(true);
  });

  it('blocks calls at the limit', () => {
    limiter.allow('test', 3, 1000);
    limiter.allow('test', 3, 1000);
    limiter.allow('test', 3, 1000);
    expect(limiter.allow('test', 3, 1000)).toBe(false);
  });

  it('allows calls after the window expires', async () => {
    limiter.allow('test', 3, 1000);
    limiter.allow('test', 3, 1000);
    limiter.allow('test', 3, 1000);
    expect(limiter.allow('test', 3, 1000)).toBe(false);
    
    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(limiter.allow('test', 3, 1000)).toBe(true);
  });

  it('tracks different keys independently', () => {
    limiter.allow('key1', 3, 1000);
    limiter.allow('key1', 3, 1000);
    limiter.allow('key1', 3, 1000);
    
    expect(limiter.allow('key1', 3, 1000)).toBe(false);
    expect(limiter.allow('key2', 3, 1000)).toBe(true);
  });

  it('resets all limits', () => {
    limiter.allow('test', 3, 1000);
    limiter.allow('test', 3, 1000);
    limiter.allow('test', 3, 1000);
    expect(limiter.allow('test', 3, 1000)).toBe(false);
    
    limiter.reset();
    expect(limiter.allow('test', 3, 1000)).toBe(true);
  });

  it('blocks zero or negative limits', () => {
    expect(limiter.allow('test', 0, 1000)).toBe(false);
    expect(limiter.allow('test', -1, 1000)).toBe(false);
  });

  it('blocks zero or negative windows', () => {
    expect(limiter.allow('test', 10, 0)).toBe(false);
    expect(limiter.allow('test', 10, -1)).toBe(false);
  });
});

describe('DEFAULT_RATE_LIMITS', () => {
  it('has stricter limits for higher risk classes', () => {
    expect(DEFAULT_RATE_LIMITS[1]!.maxCalls).toBeGreaterThan(DEFAULT_RATE_LIMITS[2]!.maxCalls);
    expect(DEFAULT_RATE_LIMITS[2]!.maxCalls).toBeGreaterThan(DEFAULT_RATE_LIMITS[3]!.maxCalls);
    expect(DEFAULT_RATE_LIMITS[4]!.maxCalls).toBe(0);
  });

  it('uses same window for all classes', () => {
    expect(DEFAULT_RATE_LIMITS[1]!.windowMs).toBe(60_000);
    expect(DEFAULT_RATE_LIMITS[2]!.windowMs).toBe(60_000);
    expect(DEFAULT_RATE_LIMITS[3]!.windowMs).toBe(60_000);
  });
});
