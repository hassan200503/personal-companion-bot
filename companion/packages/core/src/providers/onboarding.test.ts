import { describe, it, expect, vi } from 'vitest';
import { DefaultOnboardingPipeline } from './onboarding.js';

describe('OnboardingPipeline', () => {
  const pipeline = new DefaultOnboardingPipeline();

  it('validates key - empty', async () => {
    const result = await pipeline.validateKey('openrouter', '');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('validates key - unknown provider', async () => {
    const result = await pipeline.validateKey('nonexistent', 'key');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown');
  });

  it('validates key - wrong prefix', async () => {
    const result = await pipeline.validateKey('openrouter', 'wrong-prefix');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('sk-or-');
  });

  it('lists models from catalog fallback', async () => {
    // Mock fetch to fail so it falls back to catalog
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const result = await pipeline.listModels('groq', 'gsk_test123');
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.providerId).toBe('groq');
    globalThis.fetch = originalFetch;
  });

  it('lists models from live endpoint', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
    });
    const result = await pipeline.listModels('groq', 'gsk_test123');
    expect(result.models).toEqual(['model-a', 'model-b']);
    globalThis.fetch = originalFetch;
  });

  it('probes provider', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await pipeline.probe('groq', 'gsk_test123');
    expect(result.providerId).toBe('groq');
    expect(typeof result.healthy).toBe('boolean');
    globalThis.fetch = originalFetch;
  });

  it('probes unknown provider', async () => {
    const result = await pipeline.probe('nonexistent', 'key');
    expect(result.healthy).toBe(false);
    expect(result.error).toContain('Unknown');
  });

  it('seeds quotas', async () => {
    const result = await pipeline.seedQuotas('groq');
    expect(result.seeded).toBe(true);
    expect(result.limits).toBeDefined();
    expect(result.limits?.requestsPerMinute).toBeGreaterThan(0);
  });

  it('seeds quotas for unknown provider', async () => {
    const result = await pipeline.seedQuotas('nonexistent');
    expect(result.seeded).toBe(false);
  });
});