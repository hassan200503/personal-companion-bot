import type {
  ChatProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  HealthStatus,
  ProviderCapabilities,
} from './contracts.js';
import { ProviderError } from './contracts.js';

export interface MockProviderConfig {
  /** Provider identifier */
  id?: string;
  /** Provider name */
  name?: string;
  /** Simulated latency in ms */
  latency?: number;
  /** Should fail health check */
  unhealthy?: boolean;
  /** Error to throw on complete */
  completeError?: ProviderError;
  /** Error to throw on stream */
  streamError?: ProviderError;
  /** Fixed response content */
  responseContent?: string;
  /** Should simulate rate limit (429) */
  rateLimited?: boolean;
  /** Rate limit retry-after seconds */
  retryAfter?: number;
}

/**
 * Mock provider for testing
 * Supports scriptable latency, errors, rate limits, and responses
 */
export class MockProvider implements ChatProvider {
  readonly id: string;
  readonly name: string;
  
  private config: MockProviderConfig;
  private completeCalls: ChatCompletionRequest[] = [];
  private streamCalls: ChatCompletionRequest[] = [];

  constructor(config: MockProviderConfig = {}) {
    this.id = config.id || 'mock-provider';
    this.name = config.name || 'Mock Provider';
    this.config = config;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return {
      streaming: true,
      maxContextLength: 8192,
      functionCalling: false,
      vision: false,
      jsonMode: false,
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    await this.simulateLatency();
    
    if (this.config.unhealthy) {
      return {
        healthy: false,
        lastCheck: Date.now(),
        error: new ProviderError('provider_down', 'Mock provider is unhealthy'),
      };
    }

    return {
      healthy: true,
      lastCheck: Date.now(),
      latency: this.config.latency || 0,
    };
  }

  async complete(
    request: ChatCompletionRequest,
    signal: AbortSignal
  ): Promise<ChatCompletionResponse> {
    this.completeCalls.push(request);

    if (signal.aborted) {
      throw new Error('Request cancelled');
    }

    await this.simulateLatency();

    if (this.config.rateLimited) {
      throw new ProviderError(
        'rate_limited',
        'Rate limit exceeded',
        true,
        this.config.retryAfter || 60
      );
    }

    if (this.config.completeError) {
      throw this.config.completeError;
    }

    const content = this.config.responseContent || 'Mock response';
    const promptTokens = this.estimateTokens(request.messages.map(m => ({ content: m.content })));
    const completionTokens = this.estimateTokens([{ content }]);

    return {
      model: request.model,
      content,
      finishReason: 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async *stream(
    request: ChatCompletionRequest,
    signal: AbortSignal
  ): AsyncIterable<ChatCompletionChunk> {
    this.streamCalls.push(request);

    if (signal.aborted) {
      throw new Error('Request cancelled');
    }

    await this.simulateLatency();

    if (this.config.rateLimited) {
      throw new ProviderError(
        'rate_limited',
        'Rate limit exceeded',
        true,
        this.config.retryAfter || 60
      );
    }

    if (this.config.streamError) {
      throw this.config.streamError;
    }

    const content = this.config.responseContent || 'Mock streaming response';
    const words = content.split(' ');

    for (const word of words) {
      if (signal.aborted) {
        throw new Error('Request cancelled');
      }

      await this.simulateLatency(10); // 10ms per word
      yield { delta: word + ' ' };
    }

    yield { delta: '', finishReason: 'stop' };
  }

  /** Get recorded complete calls */
  getCompleteCalls(): ChatCompletionRequest[] {
    return [...this.completeCalls];
  }

  /** Get recorded stream calls */
  getStreamCalls(): ChatCompletionRequest[] {
    return [...this.streamCalls];
  }

  /** Reset call history */
  reset(): void {
    this.completeCalls = [];
    this.streamCalls = [];
  }

  /** Update configuration */
  setConfig(config: Partial<MockProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private async simulateLatency(ms?: number): Promise<void> {
    const delay = ms ?? this.config.latency ?? 0;
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  private estimateTokens(messages: Array<{ content: string }>): number {
    // Rough estimate: ~4 chars per token
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }
}
