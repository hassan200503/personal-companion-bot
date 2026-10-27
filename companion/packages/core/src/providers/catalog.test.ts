import { describe, it, expect, vi } from 'vitest';
import { decodeCustomProviderId, discoverProviderModels, encodeCustomProviderId, getProviderCatalog, getProviderEntry, getProvidersByMode, getProviderModels, validateKeyFormat } from './catalog.js';

describe('ProviderCatalog', () => {
  it('returns all providers', () => {
    const catalog = getProviderCatalog();
    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog[0]).toHaveProperty('id');
    expect(catalog[0]).toHaveProperty('displayName');
  });

  it('finds provider by id', () => {
    const entry = getProviderEntry('openai');
    expect(entry).toBeDefined();
    expect(entry?.displayName).toBe('OpenAI / ChatGPT');
  });

  it('returns undefined for unknown provider', () => {
    const entry = getProviderEntry('nonexistent');
    expect(entry).toBeUndefined();
  });

  it('filters by onboarding mode', () => {
    const assisted = getProvidersByMode('assisted');
    expect(assisted.length).toBeGreaterThan(0);
    assisted.forEach((e) => expect(e.onboardingMode).toBe('assisted'));
  });

  it('returns models for provider', () => {
    const models = getProviderModels('gemini');
    expect(models.length).toBeGreaterThan(0);
  });

  it('returns empty models for unknown provider', () => {
    const models = getProviderModels('nonexistent');
    expect(models).toHaveLength(0);
  });

  it('discovers and filters free OpenRouter models', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: 'free/model:free', name: 'Free model', pricing: { prompt: '0', completion: '0' } },
        { id: 'paid/model', name: 'Paid model', pricing: { prompt: '0.001', completion: '0.002' } },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const models = await discoverProviderModels('openrouter', 'sk-or-test');
      expect(models.map((model) => model.id)).toEqual(['free/model:free']);
      expect(models[0]?.free).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('discovers live OpenAI-compatible provider models', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'openai/gpt-oss-120b', context_window: 32768, supported_parameters: ['tools'] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    try {
      const models = await discoverProviderModels('groq', 'gsk_test');
      expect(models[0]).toMatchObject({ id: 'openai/gpt-oss-120b', supportsTools: true, free: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('validates key format - valid', () => {
    const result = validateKeyFormat('openai', 'sk-test123');
    expect(result.valid).toBe(true);
  });

  it('validates key format - empty', () => {
    const result = validateKeyFormat('openai', '');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('validates key format - wrong prefix', () => {
    const result = validateKeyFormat('openai', 'any-provider-key');
    expect(result.valid).toBe(true);
  });

  it('validates key format - unknown provider', () => {
    const result = validateKeyFormat('nonexistent', 'key');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown');
  });

  it('each provider has required fields', () => {
    const catalog = getProviderCatalog();
    catalog.forEach((entry) => {
      expect(entry.id).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.signupUrl).toBeTruthy();
      expect(entry.baseUrl).toBeTruthy();
      expect(entry.models.length).toBeGreaterThan(0);
      expect(entry.lastVerified).toBeTruthy();
      expect(typeof entry.factory).toBe('function');
    });
  });

  it('provider factory creates provider', () => {
    const entry = getProviderEntry('anthropic');
    const provider = entry?.factory('gsk_test123');
    expect(provider?.id).toBe('anthropic');
    expect(provider?.name).toBe('Anthropic / Claude');
  });

  it('round-trips non-secret custom provider settings', () => {
    const id = encodeCustomProviderId({ name: 'My Gateway', baseUrl: 'https://example.test/v1', model: 'free-model' });
    expect(decodeCustomProviderId(id)).toEqual({ name: 'My Gateway', baseUrl: 'https://example.test/v1', model: 'free-model' });
  });

  it('rejects insecure custom provider URLs', () => {
    const id = encodeCustomProviderId({ name: 'Gateway', baseUrl: 'http://example.test/v1', model: 'model' });
    expect(decodeCustomProviderId(id)).toBeUndefined();
  });
});
