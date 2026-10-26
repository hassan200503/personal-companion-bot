/**
 * Provider catalog
 *
 * Static catalog of known AI providers with onboarding metadata.
 */

import type { ProviderCatalogEntry, ChatProvider, ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, HealthStatus, ProviderCapabilities } from './contracts.js';
import { ProviderError } from './contracts.js';

// -------------------------------------------------------------------
// Catalog entries
// -------------------------------------------------------------------

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'openrouter',
    displayName: 'OpenRouter',
    onboardingMode: 'assisted',
    signupUrl: 'https://openrouter.ai/signup',
    keyUrl: 'https://openrouter.ai/keys',
    keyPrefixHint: 'sk-or-',
    needsPhone: false,
    needsCard: false,
    regionNotes: 'Global availability',
    baseUrl: 'https://openrouter.ai/api/v1',
    openAiCompatible: true,
    dataPolicyUrl: 'https://openrouter.ai/privacy',
    privacyNote: 'Routes to various providers; check individual model policies',
    guideSteps: [
      'Visit openrouter.ai/signup to create an account',
      'Navigate to openrouter.ai/keys to generate an API key',
      'Paste the key (starts with sk-or-) into the app',
    ],
    models: [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3.1-70b-instruct',
      'mistralai/mistral-large',
    ],
    lastVerified: '2025-01-01',
    factory: (apiKey: string) => createOpenAiCompatibleProvider('openrouter', 'OpenRouter', apiKey, 'https://openrouter.ai/api/v1'),
  },
  {
    id: 'groq',
    displayName: 'Groq',
    onboardingMode: 'assisted',
    signupUrl: 'https://console.groq.com/signup',
    keyUrl: 'https://console.groq.com/keys',
    keyPrefixHint: 'gsk_',
    needsPhone: false,
    needsCard: false,
    regionNotes: 'Global availability',
    baseUrl: 'https://api.groq.com/openai/v1',
    openAiCompatible: true,
    dataPolicyUrl: 'https://groq.com/privacy-policy/',
    privacyNote: 'Fast inference; data may be used for model improvement',
    guideSteps: [
      'Visit console.groq.com/signup to create an account',
      'Navigate to console.groq.com/keys to generate an API key',
      'Paste the key (starts with gsk_) into the app',
    ],
    models: [
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    lastVerified: '2025-01-01',
    factory: (apiKey: string) => createOpenAiCompatibleProvider('groq', 'Groq', apiKey, 'https://api.groq.com/openai/v1'),
  },
  {
    id: 'together',
    displayName: 'Together AI',
    onboardingMode: 'assisted',
    signupUrl: 'https://api.together.xyz/signup',
    keyUrl: 'https://api.together.xyz/settings/api-keys',
    keyPrefixHint: 'tok_',
    needsPhone: false,
    needsCard: false,
    regionNotes: 'Global availability',
    baseUrl: 'https://api.together.xyz/v1',
    openAiCompatible: true,
    dataPolicyUrl: 'https://www.together.ai/privacy',
    privacyNote: 'Open source model hosting',
    guideSteps: [
      'Visit api.together.xyz/signup to create an account',
      'Navigate to settings to generate an API key',
      'Paste the key into the app',
    ],
    models: [
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
    ],
    lastVerified: '2025-01-01',
    factory: (apiKey: string) => createOpenAiCompatibleProvider('together', 'Together AI', apiKey, 'https://api.together.xyz/v1'),
  },
  {
    id: 'fireworks',
    displayName: 'Fireworks AI',
    onboardingMode: 'assisted',
    signupUrl: 'https://fireworks.ai/signup',
    keyUrl: 'https://fireworks.ai/account/api-keys',
    keyPrefixHint: 'fw_',
    needsPhone: false,
    needsCard: false,
    regionNotes: 'Global availability',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    openAiCompatible: true,
    dataPolicyUrl: 'https://fireworks.ai/privacy',
    privacyNote: 'Fast inference for open models',
    guideSteps: [
      'Visit fireworks.ai/signup to create an account',
      'Navigate to account/api-keys to generate an API key',
      'Paste the key into the app',
    ],
    models: [
      'accounts/fireworks/models/llama-v3p1-70b-instruct',
      'accounts/fireworks/models/llama-v3p1-8b-instruct',
    ],
    lastVerified: '2025-01-01',
    factory: (apiKey: string) => createOpenAiCompatibleProvider('fireworks', 'Fireworks AI', apiKey, 'https://api.fireworks.ai/inference/v1'),
  },
];
// -------------------------------------------------------------------
// OpenAI-compatible provider factory
// -------------------------------------------------------------------

class OpenAiCompatibleProvider implements ChatProvider {
  readonly id: string;
  readonly name: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(id: string, name: string, apiKey: string, baseUrl: string) {
    this.id = id;
    this.name = name;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return { streaming: true, maxContextLength: 128000, functionCalling: true, vision: false, jsonMode: true };
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const response = await fetch(this.baseUrl + '/models', {
        headers: { Authorization: 'Bearer ' + this.apiKey },
        signal: AbortSignal.timeout(10000),
      });
      return {
        healthy: response.ok,
        lastCheck: Date.now(),
        latency: 0,
        error: response.ok ? undefined : new ProviderError('auth_invalid', 'HTTP ' + response.status),
      };
    } catch (error) {
      return { healthy: false, lastCheck: Date.now(), error: new ProviderError('network', String(error)) };
    }
  }
  async complete(request: ChatCompletionRequest, signal: AbortSignal): Promise<ChatCompletionResponse> {
    const response = await fetch(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.apiKey },
      body: JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature, max_tokens: request.maxTokens, stop: request.stop }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401) throw new ProviderError('auth_invalid', text, false);
      if (response.status === 429) throw new ProviderError('rate_limited', text, true, 60);
      if (response.status === 402) throw new ProviderError('quota_exhausted', text, false);
      throw new ProviderError('unknown', text, response.status >= 500);
    }

    const data = await response.json() as {
      model: string;
      choices: Array<{ message: { content: string }; finish_reason: string }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    return {
      model: data.model,
      content: data.choices[0]?.message?.content || '',
      finishReason: (data.choices[0]?.finish_reason as ChatCompletionResponse['finishReason']) || 'stop',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  async *stream(request: ChatCompletionRequest, signal: AbortSignal): AsyncIterable<ChatCompletionChunk> {
    const response = await fetch(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.apiKey },
      body: JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature, max_tokens: request.maxTokens, stop: request.stop, stream: true }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError('unknown', text, response.status >= 500);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new ProviderError('unknown', 'No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content || '';
            const finishReason = json.choices?.[0]?.finish_reason;
            if (delta || finishReason) yield { delta, finishReason };
          } catch { /* skip */ }
        }
      }
    }
  }
}

function createOpenAiCompatibleProvider(id: string, name: string, apiKey: string, baseUrl: string): ChatProvider {
  return new OpenAiCompatibleProvider(id, name, apiKey, baseUrl);
}
// -------------------------------------------------------------------
// Catalog helpers
// -------------------------------------------------------------------

export function getProviderCatalog(): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG;
}

export function getProviderEntry(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((entry) => entry.id === id);
}

export function getProvidersByMode(mode: 'oauth' | 'assisted' | 'manual'): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG.filter((entry) => entry.onboardingMode === mode);
}

export function getProviderModels(id: string): string[] {
  const entry = getProviderEntry(id);
  return entry?.models || [];
}

export function validateKeyFormat(id: string, key: string): { valid: boolean; error?: string } {
  const entry = getProviderEntry(id);
  if (!entry) return { valid: false, error: 'Unknown provider: ' + id };
  if (!key || key.trim().length === 0) return { valid: false, error: 'API key is empty' };
  if (entry.keyPrefixHint && !key.startsWith(entry.keyPrefixHint)) {
    return { valid: false, error: 'Key should start with "' + entry.keyPrefixHint + '"' };
  }
  return { valid: true };
}