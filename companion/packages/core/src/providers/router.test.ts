import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from './mock-provider.js';
import { ProviderRouter, QuotaLedger, CircuitBreaker } from './router.js';
import { ProviderError } from './contracts.js';

describe('QuotaLedger', () => {
  let ledger: QuotaLedger;
  beforeEach(() => { ledger = new QuotaLedger(); });
  it('records usage', () => {
    ledger.record('p1', 100, 50);
    const u = ledger.get('p1');
    expect(u?.promptTokens).toBe(100);
    expect(u?.completionTokens).toBe(50);
    expect(u?.totalTokens).toBe(150);
    expect(u?.requestCount).toBe(1);
  });
  it('accumulates usage', () => {
    ledger.record('p1', 100, 50);
    ledger.record('p1', 200, 100);
    const u = ledger.get('p1');
    expect(u?.promptTokens).toBe(300);
    expect(u?.completionTokens).toBe(150);
    expect(u?.totalTokens).toBe(450);
    expect(u?.requestCount).toBe(2);
  });
  it('records rate limit', () => {
    ledger.recordRateLimit('p1', 60);
    expect(ledger.isRateLimited('p1')).toBe(true);
    expect(ledger.getRetryAfter('p1')).toBeGreaterThan(0);
  });
  it('returns all usage', () => {
    ledger.record('p1', 100, 50);
    ledger.record('p2', 200, 100);
    expect(ledger.getAll()).toHaveLength(2);
  });
  it('resets specific provider', () => {
    ledger.record('p1', 100, 50);
    ledger.record('p2', 200, 100);
    ledger.reset('p1');
    expect(ledger.get('p1')).toBeUndefined();
    expect(ledger.get('p2')).toBeDefined();
  });
  it('resets all', () => {
    ledger.record('p1', 100, 50);
    ledger.reset();
    expect(ledger.getAll()).toHaveLength(0);
  });
});

describe('CircuitBreaker', () => {
  it('starts closed', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
    expect(cb.isOpen()).toBe(false);
  });
  it('opens after threshold failures', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure(); cb.recordFailure(); cb.recordFailure();
    expect(cb.getState()).toBe('open');
    expect(cb.isOpen()).toBe(true);
  });
  it('transitions to half-open after cooldown', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
    cb.recordFailure(); cb.recordFailure();
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe('half-open');
  });
  it('closes after success threshold in half-open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 10, successThreshold: 2 });
    cb.recordFailure(); cb.recordFailure();
    await new Promise((r) => setTimeout(r, 20));
    expect(cb.getState()).toBe('half-open');
    cb.recordSuccess(); cb.recordSuccess();
    expect(cb.getState()).toBe('closed');
  });
  it('resets', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure(); cb.recordFailure();
    cb.reset();
    expect(cb.getState()).toBe('closed');
  });
});
describe('ProviderRouter', () => {
  let router: ProviderRouter;
  let provider1: MockProvider;
  let provider2: MockProvider;
  beforeEach(() => {
    router = new ProviderRouter({ maxRetries: 3 });
    provider1 = new MockProvider({ id: 'provider-1', name: 'Provider 1' });
    provider2 = new MockProvider({ id: 'provider-2', name: 'Provider 2' });
    router.register(provider1, 1);
    router.register(provider2, 2);
  });
  it('registers providers', () => {
    const providers = router.getProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0]?.provider.id).toBe('provider-1');
  });
  it('unregisters providers', () => {
    router.unregister('provider-1');
    expect(router.getProviders()).toHaveLength(1);
  });
  it('enables/disables providers', () => {
    router.setEnabled('provider-1', false);
    const providers = router.getProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0]?.provider.id).toBe('provider-2');
  });
  it('selects highest priority healthy provider', async () => {
    const selected = await router.selectProvider();
    expect(selected?.id).toBe('provider-1');
  });
  it('skips unhealthy providers', async () => {
    provider1.setConfig({ unhealthy: true });
    const selected = await router.selectProvider();
    expect(selected?.id).toBe('provider-2');
  });
  it('excludes specified providers', async () => {
    const selected = await router.selectProvider(['provider-1']);
    expect(selected?.id).toBe('provider-2');
  });
  it('returns null when no providers available', async () => {
    router.setEnabled('provider-1', false);
    router.setEnabled('provider-2', false);
    const selected = await router.selectProvider();
    expect(selected).toBeNull();
  });
  it('completes request with fallback', async () => {
    provider1.setConfig({ completeError: new ProviderError('provider_down', 'down', true) });
    const request = { model: 'test', messages: [{ role: 'user' as const, content: 'hi' }] };
    const response = await router.complete(request, new AbortController().signal);
    expect(response.content).toBe('Mock response');
  });
  it('records quota on completion', async () => {
    const request = { model: 'test', messages: [{ role: 'user' as const, content: 'hi' }] };
    await router.complete(request, new AbortController().signal);
    const usage = router.getQuotaLedger().get('provider-1');
    expect(usage).toBeDefined();
    expect(usage?.requestCount).toBe(1);
  });
  it('throws when all providers fail', async () => {
    provider1.setConfig({ completeError: new ProviderError('provider_down', 'down', false) });
    provider2.setConfig({ completeError: new ProviderError('provider_down', 'down', false) });
    const request = { model: 'test', messages: [{ role: 'user' as const, content: 'hi' }] };
    await expect(router.complete(request, new AbortController().signal)).rejects.toThrow(ProviderError);
  });
  it('does not retry non-retryable errors', async () => {
    provider1.setConfig({ completeError: new ProviderError('auth_invalid', 'bad key', false) });
    const request = { model: 'test', messages: [{ role: 'user' as const, content: 'hi' }] };
    try {
      await router.complete(request, new AbortController().signal);
    } catch (e) {
      expect((e as ProviderError).code).toBe('auth_invalid');
    }
  });
  it('handles rate limiting', async () => {
    provider1.setConfig({ rateLimited: true, retryAfter: 60 });
    const request = { model: 'test', messages: [{ role: 'user' as const, content: 'hi' }] };
    const response = await router.complete(request, new AbortController().signal);
    expect(response.content).toBe('Mock response');
    expect(router.getQuotaLedger().isRateLimited('provider-1')).toBe(true);
  });
  it('streams with fallback', async () => {
    provider1.setConfig({ streamError: new ProviderError('provider_down', 'down', true) });
    const request = { model: 'test', messages: [{ role: 'user' as const, content: 'hi' }] };
    const chunks: string[] = [];
    for await (const chunk of router.stream(request, new AbortController().signal)) {
      if (chunk.delta) chunks.push(chunk.delta);
    }
    expect(chunks.length).toBeGreaterThan(0);
  });
  it('returns status', () => {
    const status = router.getStatus();
    expect(status.providers).toHaveLength(2);
    expect(status.quota).toBeDefined();
  });
  it('resets router', () => {
    router.reset();
    const status = router.getStatus();
    expect(status.quota).toHaveLength(0);
  });
});