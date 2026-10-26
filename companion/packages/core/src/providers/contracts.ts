/**
 * Provider gateway contracts
 * 
 * Defines the interface for AI provider integration, error taxonomy,
 * and request/response types for chat completion.
 */

/** Error codes for provider failures */
export type ProviderErrorCode =
  | 'auth_invalid'           // API key invalid or expired
  | 'rate_limited'           // Hit rate limit (429)
  | 'quota_exhausted'        // Quota/credits depleted
  | 'region_blocked'         // Service not available in region
  | 'verification_required'  // Account needs phone/email verification
  | 'timeout'                // Request timeout
  | 'network'                // Network connectivity issue
  | 'provider_down'          // Provider service unavailable
  | 'bad_request'            // Invalid request format
  | 'content_blocked'        // Content policy violation
  | 'unknown';               // Unclassified error

/** Provider error with structured information */
export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly retryAfter?: number, // seconds
    public override readonly cause?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Provider capabilities */
export interface ProviderCapabilities {
  /** Supports streaming responses */
  streaming: boolean;
  /** Maximum context length in tokens */
  maxContextLength: number;
  /** Supports function calling */
  functionCalling: boolean;
  /** Supports vision/image inputs */
  vision: boolean;
  /** Supports JSON mode */
  jsonMode: boolean;
}

/** Message role */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** Chat message */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  /** Optional message name (for tool results) */
  name?: string;
}

/** Chat completion request */
export interface ChatCompletionRequest {
  /** Model identifier */
  model: string;
  /** Conversation messages */
  messages: ChatMessage[];
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Stop sequences */
  stop?: string[];
  /** Request JSON mode output */
  jsonMode?: boolean;
  /** User identifier for abuse monitoring */
  user?: string;
}

/** Usage statistics */
export interface UsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Chat completion response */
export interface ChatCompletionResponse {
  /** Model that generated the response */
  model: string;
  /** Generated content */
  content: string;
  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';
  /** Token usage */
  usage?: UsageInfo;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/** Streaming chunk */
export interface ChatCompletionChunk {
  /** Incremental content delta */
  delta: string;
  /** Finish reason (present on last chunk) */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'error';
}

/** Provider health status */
export interface HealthStatus {
  /** Is provider operational */
  healthy: boolean;
  /** Last check timestamp */
  lastCheck: number;
  /** Latency in milliseconds */
  latency?: number;
  /** Error if unhealthy */
  error?: ProviderError;
}

/** Chat provider interface */
export interface ChatProvider {
  /** Provider identifier */
  readonly id: string;
  
  /** Provider display name */
  readonly name: string;
  
  /** Get provider capabilities */
  capabilities(model?: string): Promise<ProviderCapabilities>;
  
  /** Check provider health */
  healthCheck(): Promise<HealthStatus>;
  
  /**
   * Complete a chat request
   * @param request Chat completion request
   * @param signal Cancellation signal
   * @returns Completion response
   * @throws ProviderError on failure
   */
  complete(
    request: ChatCompletionRequest,
    signal: AbortSignal
  ): Promise<ChatCompletionResponse>;
  
  /**
   * Stream a chat completion
   * @param request Chat completion request
   * @param signal Cancellation signal
   * @returns Async iterator of chunks
   * @throws ProviderError on failure
   */
  stream(
    request: ChatCompletionRequest,
    signal: AbortSignal
  ): AsyncIterable<ChatCompletionChunk>;
}

/** Provider factory function */
export type ProviderFactory = (apiKey: string) => ChatProvider;

/** Provider catalog entry */
export interface ProviderCatalogEntry {
  /** Provider identifier */
  id: string;
  
  /** Display name */
  displayName: string;
  
  /** Onboarding mode */
  onboardingMode: 'oauth' | 'assisted' | 'manual';
  
  /** Signup URL */
  signupUrl: string;
  
  /** API key page URL */
  keyUrl?: string;
  
  /** Expected key prefix (e.g., 'sk-', 'gsk_') */
  keyPrefixHint?: string;
  
  /** Requires phone verification */
  needsPhone: boolean;
  
  /** Requires payment card */
  needsCard: boolean;
  
  /** Region availability notes */
  regionNotes?: string;
  
  /** Base API URL */
  baseUrl: string;
  
  /** OpenAI-compatible API */
  openAiCompatible: boolean;
  
  /** Data policy URL */
  dataPolicyUrl: string;
  
  /** Privacy notes */
  privacyNote?: string;

  /** Whether the listed default models are intended for the provider's no-cost tier. */
  freeTier: boolean;

  /** Human-readable warning that free-tier availability and limits are account-specific. */
  pricingNote?: string;
  
  /** Onboarding guide steps */
  guideSteps?: string[];
  
  /** Available models */
  models: string[];
  
  /** Last catalog verification date */
  lastVerified: string;
  
  /** Provider factory */
  factory: ProviderFactory;
}
