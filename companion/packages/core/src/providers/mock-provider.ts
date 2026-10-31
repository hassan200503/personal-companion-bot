import type {
  ChatProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  AudioTranscriptionRequest,
  AudioTranscriptionResult,
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
  /** Error to throw on transcribe */
  transcribeError?: ProviderError;
  /** Fixed response content */
  responseContent?: string;
  /** Fixed transcription text */
  transcript?: string;
  /** Simulate transient complete failures before succeeding */
  completeFailures?: number;
  /** Simulate transient transcription failures before succeeding */
  transcribeFailures?: number;
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
  private transcribeCalls: AudioTranscriptionRequest[] = [];
  private remainingCompleteFailures: number;
  private remainingTranscribeFailures: number;

  constructor(config: MockProviderConfig = {}) {
    this.id = config.id || 'mock-provider';
    this.name = config.name || 'Mock Provider';
    this.config = config;
    this.remainingCompleteFailures = config.completeFailures ?? 0;
    this.remainingTranscribeFailures = config.transcribeFailures ?? 0;
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

    if (this.remainingCompleteFailures > 0) {
      this.remainingCompleteFailures -= 1;
      throw new ProviderError('provider_down', 'Transient mock failure', true);
    }

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

  async transcribe(
    request: AudioTranscriptionRequest,
    signal: AbortSignal
  ): Promise<AudioTranscriptionResult> {
    this.transcribeCalls.push(request);

    if (signal.aborted) {
      throw new Error('Request cancelled');
    }

    await this.simulateLatency();

    if (this.remainingTranscribeFailures > 0) {
      this.remainingTranscribeFailures -= 1;
      throw new ProviderError('provider_down', 'Transient mock transcription failure', true);
    }

    if (this.config.rateLimited) {
      throw new ProviderError(
        'rate_limited',
        'Rate limit exceeded',
        true,
        this.config.retryAfter || 60
      );
    }

    if (this.config.transcribeError) {
      throw this.config.transcribeError;
    }

    return {
      text: this.config.transcript ?? 'Mock transcript',
      model: request.model,
    };
  }

  /** Get recorded transcribe calls */
  getTranscribeCalls(): AudioTranscriptionRequest[] {
    return [...this.transcribeCalls];
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
    this.transcribeCalls = [];
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
