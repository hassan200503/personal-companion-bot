import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from './mock-provider.js';
import { ProviderError } from './contracts.js';

describe('MockProvider', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  it('has correct metadata', () => {
    expect(provider.id).toBe('mock-provider');
    expect(provider.name).toBe('Mock Provider');
  });

  it('allows custom id and name', () => {
    const custom = new MockProvider({
      id: 'test-provider',
      name: 'Test Provider',
    });

    expect(custom.id).toBe('test-provider');
    expect(custom.name).toBe('Test Provider');
  });

  it('returns capabilities', async () => {
    const caps = await provider.capabilities();

    expect(caps.streaming).toBe(true);
    expect(caps.maxContextLength).toBe(8192);
    expect(caps.functionCalling).toBe(false);
    expect(caps.vision).toBe(false);
    expect(caps.jsonMode).toBe(false);
  });

  it('passes health check by default', async () => {
    const health = await provider.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.lastCheck).toBeGreaterThan(0);
    expect(health.latency).toBe(0);
  });

  it('fails health check when configured', async () => {
    provider.setConfig({ unhealthy: true });
    const health = await provider.healthCheck();

    expect(health.healthy).toBe(false);
    expect(health.error).toBeDefined();
    expect(health.error?.code).toBe('provider_down');
  });

  it('completes chat request', async () => {
    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Hello' }],
    };

    const response = await provider.complete(request, new AbortController().signal);

    expect(response.model).toBe('test-model');
    expect(response.content).toBe('Mock response');
    expect(response.finishReason).toBe('stop');
    expect(response.usage).toBeDefined();
    expect(response.usage?.promptTokens).toBeGreaterThan(0);
  });

  it('returns custom response content', async () => {
    provider.setConfig({ responseContent: 'Custom test response' });

    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    const response = await provider.complete(request, new AbortController().signal);
    expect(response.content).toBe('Custom test response');
  });

  it('throws rate limit error when configured', async () => {
    provider.setConfig({ rateLimited: true, retryAfter: 30 });

    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    await expect(
      provider.complete(request, new AbortController().signal)
    ).rejects.toThrow(ProviderError);

    try {
      await provider.complete(request, new AbortController().signal);
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      if (error instanceof ProviderError) {
        expect(error.code).toBe('rate_limited');
        expect(error.retryable).toBe(true);
        expect(error.retryAfter).toBe(30);
      }
    }
  });

  it('throws custom error when configured', async () => {
    const customError = new ProviderError('auth_invalid', 'Invalid API key');
    provider.setConfig({ completeError: customError });

    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    await expect(
      provider.complete(request, new AbortController().signal)
    ).rejects.toThrow('Invalid API key');
  });

  it('streams chat response', async () => {
    provider.setConfig({ responseContent: 'Hello world test', latency: 0 });

    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    const chunks: string[] = [];
    for await (const chunk of provider.stream(request, new AbortController().signal)) {
      chunks.push(chunk.delta);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('Hello');
    expect(chunks.join('')).toContain('world');
    expect(chunks[chunks.length - 1]).toBe('');
  });

  it('throws stream error when configured', async () => {
    const customError = new ProviderError('timeout', 'Stream timeout');
    provider.setConfig({ streamError: customError });

    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    await expect(async () => {
      for await (const _ of provider.stream(request, new AbortController().signal)) {
        // Should throw before yielding
      }
    }).rejects.toThrow('Stream timeout');
  });

  it('respects cancellation in complete', async () => {
    provider.setConfig({ latency: 100 });

    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.complete(request, controller.signal)
    ).rejects.toThrow('cancelled');
  });

  it('respects cancellation in stream', async () => {
    provider.setConfig({ latency: 100 });

    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    const controller = new AbortController();
    controller.abort();

    await expect(async () => {
      for await (const _ of provider.stream(request, controller.signal)) {
        // Should throw before yielding
      }
    }).rejects.toThrow('cancelled');
  });

  it('records complete calls', async () => {
    const request1 = {
      model: 'model-1',
      messages: [{ role: 'user' as const, content: 'First' }],
    };

    const request2 = {
      model: 'model-2',
      messages: [{ role: 'user' as const, content: 'Second' }],
    };

    await provider.complete(request1, new AbortController().signal);
    await provider.complete(request2, new AbortController().signal);

    const calls = provider.getCompleteCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.model).toBe('model-1');
    expect(calls[1]?.model).toBe('model-2');
  });

  it('records stream calls', async () => {
    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    for await (const _ of provider.stream(request, new AbortController().signal)) {
      // Consume stream
    }

    const calls = provider.getStreamCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe('test-model');
  });

  it('resets call history', async () => {
    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    await provider.complete(request, new AbortController().signal);
    expect(provider.getCompleteCalls()).toHaveLength(1);

    provider.reset();
    expect(provider.getCompleteCalls()).toHaveLength(0);
    expect(provider.getStreamCalls()).toHaveLength(0);
  });

  it('simulates latency', async () => {
    provider.setConfig({ latency: 50 });

    const request = {
      model: 'test-model',
      messages: [{ role: 'user' as const, content: 'Test' }],
    };

    const start = Date.now();
    await provider.complete(request, new AbortController().signal);
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(50);
  });

  it('estimates token usage', async () => {
    const request = {
      model: 'test-model',
      messages: [
        { role: 'user' as const, content: 'This is a test message with multiple words' },
      ],
    };

    const response = await provider.complete(request, new AbortController().signal);

    expect(response.usage?.promptTokens).toBeGreaterThan(0);
    expect(response.usage?.completionTokens).toBeGreaterThan(0);
    expect(response.usage?.totalTokens).toBe(
      response.usage.promptTokens + response.usage.completionTokens
    );
  });
});
