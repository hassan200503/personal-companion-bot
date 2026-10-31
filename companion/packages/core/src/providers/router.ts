/**
 * Provider router
 *
 * Manages provider selection, quota tracking, circuit breakers, and fallback.
 */

import type {
  ChatProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  AudioTranscriptionRequest,
  AudioTranscriptionResult,
} from './contracts.js';
import { ProviderError } from './contracts.js';

// -------------------------------------------------------------------
// Quota ledger
// -------------------------------------------------------------------

export interface QuotaUsage {
  providerId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
  lastRequest: number;
  lastRateLimit?: number;
  retryAfter?: number;
}

export class QuotaLedger {
  private usage = new Map<string, QuotaUsage>();

  record(providerId: string, promptTokens: number, completionTokens: number): void {
    const existing = this.usage.get(providerId) || {
      providerId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requestCount: 0,
      lastRequest: 0,
    };

    existing.promptTokens += promptTokens;
    existing.completionTokens += completionTokens;
    existing.totalTokens += promptTokens + completionTokens;
    existing.requestCount += 1;
    existing.lastRequest = Date.now();

    this.usage.set(providerId, existing);
  }

  recordRateLimit(providerId: string, retryAfter: number): void {
    const existing = this.usage.get(providerId) || {
      providerId,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requestCount: 0,
      lastRequest: 0,
    };

    existing.lastRateLimit = Date.now();
    existing.retryAfter = retryAfter;
    this.usage.set(providerId, existing);
  }

  get(providerId: string): QuotaUsage | undefined {
    return this.usage.get(providerId);
  }

  getAll(): QuotaUsage[] {
    return Array.from(this.usage.values());
  }

  isRateLimited(providerId: string): boolean {
    const usage = this.usage.get(providerId);
    if (!usage?.lastRateLimit || !usage.retryAfter) return false;
    const elapsed = Date.now() - usage.lastRateLimit;
    return elapsed < usage.retryAfter * 1000;
  }

  getRetryAfter(providerId: string): number {
    const usage = this.usage.get(providerId);
    if (!usage?.lastRateLimit || !usage.retryAfter) return 0;
    const elapsed = Date.now() - usage.lastRateLimit;
    const remaining = usage.retryAfter * 1000 - elapsed;
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  reset(providerId?: string): void {
    if (providerId) {
      this.usage.delete(providerId);
    } else {
      this.usage.clear();
    }
  }
}
// -------------------------------------------------------------------
// Circuit breaker
// -------------------------------------------------------------------

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  successThreshold: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60000,
  successThreshold: 2,
};

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailure = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
  }

  getState(): CircuitState {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailure;
      if (elapsed >= this.config.cooldownMs) {
        this.state = 'half-open';
        this.successes = 0;
      }
    }
    return this.state;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successes += 1;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
      }
    } else if (this.state === 'closed') {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  recordFailure(): void {
    this.failures += 1;
    this.lastFailure = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  isOpen(): boolean {
    return this.getState() === 'open';
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = 0;
  }
}
// -------------------------------------------------------------------
// Router
// -------------------------------------------------------------------

export interface RouterProvider {
  provider: ChatProvider;
  priority: number;
  enabled: boolean;
  /** Model selected for this provider; prevents a fallback provider receiving another provider's model id. */
  model?: string;
}

export interface RouterConfig {
  maxRetries: number;
  circuitConfig: Partial<CircuitBreakerConfig>;
}

const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  maxRetries: 3,
  circuitConfig: {},
};

function isProviderOutage(error: Error): boolean {
  if (!(error instanceof ProviderError)) return true;
  return error.code === 'provider_down' || error.code === 'timeout' || error.code === 'network';
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Request aborted');
}

export class ProviderRouter {
  private providers: Map<string, RouterProvider> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private transcriptionBreakers: Map<string, CircuitBreaker> = new Map();
  private healthCache: Map<string, number> = new Map();
  private quotaLedger: QuotaLedger;
  private config: RouterConfig;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.quotaLedger = new QuotaLedger();
  }

  register(provider: ChatProvider, priority: number = 100, model?: string): void {
    this.providers.set(provider.id, {
      provider,
      priority,
      enabled: true,
      model,
    });
    this.circuitBreakers.set(provider.id, new CircuitBreaker(this.config.circuitConfig));
    this.transcriptionBreakers.set(provider.id, new CircuitBreaker(this.config.circuitConfig));
    this.healthCache.delete(provider.id);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
    this.circuitBreakers.delete(providerId);
    this.transcriptionBreakers.delete(providerId);
    this.healthCache.delete(providerId);
  }

  setEnabled(providerId: string, enabled: boolean): void {
    const rp = this.providers.get(providerId);
    if (rp) {
      rp.enabled = enabled;
    }
  }

  getProviders(): RouterProvider[] {
    return Array.from(this.providers.values())
      .filter((rp) => rp.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  getProvider(id: string): ChatProvider | undefined {
    return this.providers.get(id)?.provider;
  }

  getQuotaLedger(): QuotaLedger {
    return this.quotaLedger;
  }

  getCircuitBreaker(providerId: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(providerId);
  }

  getTranscriptionCircuitBreaker(providerId: string): CircuitBreaker | undefined {
    return this.transcriptionBreakers.get(providerId);
  }

  async selectProvider(
    exclude: string[] = []
  ): Promise<ChatProvider | null> {
    const candidates = this.getProviders().filter(
      (rp) => !exclude.includes(rp.provider.id)
    );

    for (const rp of candidates) {
      const cb = this.circuitBreakers.get(rp.provider.id)!;
      if (cb.isOpen()) continue;
      if (this.quotaLedger.isRateLimited(rp.provider.id)) continue;
      const cachedHealthyUntil = this.healthCache.get(rp.provider.id) ?? 0;
      if (cachedHealthyUntil > Date.now()) return rp.provider;

      try {
        const health = await rp.provider.healthCheck();
        if (health.healthy) {
          // Avoid a full remote model probe before every message. This is
          // especially important for voice: a reply can arrive immediately
          // after the user's previous utterance.
          this.healthCache.set(rp.provider.id, Date.now() + 30_000);
          return rp.provider;
        }
        this.healthCache.delete(rp.provider.id);
      } catch {
        this.healthCache.delete(rp.provider.id);
        cb.recordFailure();
      }
    }

    return null;
  }

  async transcribe(
    request: AudioTranscriptionRequest,
    signal: AbortSignal
  ): Promise<AudioTranscriptionResult> {
    if (signal.aborted) throw abortError(signal);
    let lastError: Error | undefined;
    const maxAttempts = Math.max(1, this.config.maxRetries);
    for (const rp of this.getProviders()) {
      if (!rp.provider.transcribe) continue;
      const breaker = this.transcriptionBreakers.get(rp.provider.id);
      if (breaker?.isOpen()) continue;
      if (this.quotaLedger.isRateLimited(rp.provider.id)) continue;
      const providerRequest = rp.model ? { ...request, model: rp.model } : request;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal.aborted) throw abortError(signal);
        try {
          const result = await rp.provider.transcribe(providerRequest, signal);
          breaker?.recordSuccess();
          return result;
        } catch (error) {
          if (signal.aborted) throw abortError(signal);
          lastError = error instanceof Error ? error : new Error(String(error));
          if (error instanceof ProviderError && error.code === 'rate_limited') {
            this.quotaLedger.recordRateLimit(rp.provider.id, error.retryAfter || 60);
          } else if (isProviderOutage(lastError)) {
            breaker?.recordFailure();
          }
          if (error instanceof ProviderError && !error.retryable) break;
          // Brief backoff for 503 / high-demand spikes before retrying the same provider.
          if (attempt + 1 < maxAttempts && !signal.aborted) {
            const waitMs = Math.min(2500, 400 * (attempt + 1));
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
      }
    }
    throw lastError instanceof ProviderError
      ? lastError
      : new ProviderError('bad_request', 'No connected provider supports speech transcription.', false, undefined, lastError);
  }

  async complete(
    request: ChatCompletionRequest,
    signal: AbortSignal
  ): Promise<ChatCompletionResponse> {
    if (signal.aborted) throw abortError(signal);
    const tried: string[] = [];
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      const provider = await this.selectProvider(tried);
      if (!provider) {
        if (tried.length > 0 && attempt + 1 < this.config.maxRetries) {
          tried.length = 0;
          continue;
        }
        if (lastError) throw lastError;
        throw new ProviderError(
          'provider_down',
          'No available providers',
          false
        );
      }

      const cb = this.circuitBreakers.get(provider.id)!;

      try {
        const registration = this.providers.get(provider.id);
        const providerRequest = registration?.model ? { ...request, model: registration.model } : request;
        const response = await provider.complete(providerRequest, signal);

        cb.recordSuccess();
        this.healthCache.set(provider.id, Date.now() + 30_000);
        if (response.usage) {
          this.quotaLedger.record(
            provider.id,
            response.usage.promptTokens,
            response.usage.completionTokens
          );
        }

        return response;
      } catch (error) {
        if (signal.aborted) throw abortError(signal);
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof ProviderError && error.code === 'rate_limited') {
          this.quotaLedger.recordRateLimit(
            provider.id,
            error.retryAfter || 60
          );
        } else if (isProviderOutage(lastError)) {
          cb.recordFailure();
        }
        tried.push(provider.id);

        if (attempt + 1 < this.config.maxRetries && !signal.aborted) {
          const waitMs = Math.min(2500, 400 * (attempt + 1));
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }

    throw lastError || new ProviderError('unknown', 'Request failed after retries');
  }

  async *stream(
    request: ChatCompletionRequest,
    signal: AbortSignal
  ): AsyncIterable<ChatCompletionChunk> {
    if (signal.aborted) throw abortError(signal);
    const tried: string[] = [];
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      const provider = await this.selectProvider(tried);
      if (!provider) {
        if (tried.length > 0 && attempt + 1 < this.config.maxRetries) {
          tried.length = 0;
          continue;
        }
        if (lastError) throw lastError;
        throw new ProviderError(
          'provider_down',
          'No available providers',
          false
        );
      }

      const cb = this.circuitBreakers.get(provider.id)!;
      let yielded = false;

      try {
        const registration = this.providers.get(provider.id);
        const providerRequest = registration?.model ? { ...request, model: registration.model } : request;
        const stream = provider.stream(providerRequest, signal);

        for await (const chunk of stream) {
          yielded = true;
          yield chunk;
        }

        cb.recordSuccess();
        this.healthCache.set(provider.id, Date.now() + 30_000);
        return;
      } catch (error) {
        if (signal.aborted) throw abortError(signal);
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof ProviderError && error.code === 'rate_limited') {
          this.quotaLedger.recordRateLimit(
            provider.id,
            error.retryAfter || 60
          );
        } else if (isProviderOutage(lastError)) {
          cb.recordFailure();
        }
        // Once text has reached the caller, retrying another provider would
        // duplicate the answer. Fail the stream instead.
        if (yielded) throw lastError;
        tried.push(provider.id);

        if (attempt + 1 < this.config.maxRetries && !signal.aborted) {
          const waitMs = Math.min(2500, 400 * (attempt + 1));
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
    }

    throw lastError || new ProviderError('unknown', 'Stream failed after retries');
  }

  getStatus(): {
    providers: Array<{
      id: string;
      enabled: boolean;
      priority: number;
      circuitState: CircuitState;
      transcriptionCircuitState: CircuitState;
      rateLimited: boolean;
    }>;
    quota: QuotaUsage[];
  } {
    const providers = this.getProviders().map((rp) => ({
      id: rp.provider.id,
      enabled: rp.enabled,
      priority: rp.priority,
      circuitState: this.circuitBreakers.get(rp.provider.id)!.getState(),
      transcriptionCircuitState: this.transcriptionBreakers.get(rp.provider.id)!.getState(),
      rateLimited: this.quotaLedger.isRateLimited(rp.provider.id),
    }));

    return {
      providers,
      quota: this.quotaLedger.getAll(),
    };
  }

  reset(): void {
    for (const cb of this.circuitBreakers.values()) {
      cb.reset();
    }
    for (const cb of this.transcriptionBreakers.values()) {
      cb.reset();
    }
    this.quotaLedger.reset();
  }
}
