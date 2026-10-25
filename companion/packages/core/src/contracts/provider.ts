export const providerErrorCodes = [
  "auth_invalid",
  "rate_limited",
  "quota_exhausted",
  "region_blocked",
  "verification_required",
  "timeout",
  "network",
  "provider_down",
  "bad_request",
  "content_blocked",
  "unknown"
] as const;

export type ProviderErrorCode = (typeof providerErrorCodes)[number];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ChatUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatResponse {
  text: string;
  usage?: ChatUsage;
}

export interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
}

export interface HealthStatus {
  ok: boolean;
  checkedAt: string;
  message?: string;
}

export interface ChatProvider {
  readonly id: string;
  capabilities(): ProviderCapabilities;
  healthCheck(signal: AbortSignal): Promise<HealthStatus>;
  complete(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse>;
  stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<string>;
}
