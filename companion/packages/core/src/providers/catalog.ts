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

const RETIRED_PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    onboardingMode: 'assisted',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPrefixHint: 'AIza',
    needsPhone: false,
    needsCard: false,
    regionNotes: 'Free-tier eligibility is account and region dependent',
    baseUrl: 'https://generativelanguage.googleapis.com',
    openAiCompatible: false,
    dataPolicyUrl: 'https://ai.google.dev/gemini-api/terms',
    privacyNote: 'Google states that free-tier API content may be used to improve products; review the current terms before connecting.',
    pricingNote: 'Free tier only. Limits and eligible models can change; the app learns them from responses instead of assuming a quota.',
    freeTier: true,
    guideSteps: [
      'Open Google AI Studio and create an API key',
      'Paste the key into Companion; it is stored in Windows Credential Manager',
      'The app tests the key with a tiny request before saving it',
    ],
    models: ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'],
    lastVerified: '2026-10-26',
    factory: (apiKey: string) => createGeminiProvider(apiKey),
  },
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
    pricingNote: 'Only models explicitly marked free by OpenRouter should be selected; availability changes frequently.',
    freeTier: true,
    models: ['meta-llama/llama-3.3-8b-instruct:free'],
    lastVerified: '2026-10-26',
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
    pricingNote: 'Free developer tier with account-specific limits exposed in response headers.',
    freeTier: true,
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
    lastVerified: '2026-10-26',
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
    pricingNote: 'Free mode/credits and limits depend on the account; no paid fallback is enabled by Companion.',
    freeTier: true,
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
    lastVerified: '2026-10-26',
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
    pricingNote: 'Availability and free credits are account-specific; verify before use.',
    freeTier: true,
    guideSteps: [
      'Visit fireworks.ai/signup to create an account',
      'Navigate to account/api-keys to generate an API key',
      'Paste the key into the app',
    ],
    models: [
      'accounts/fireworks/models/llama-v3p1-70b-instruct',
      'accounts/fireworks/models/llama-v3p1-8b-instruct',
    ],
    lastVerified: '2026-10-26',
    factory: (apiKey: string) => createOpenAiCompatibleProvider('fireworks', 'Fireworks AI', apiKey, 'https://api.fireworks.ai/inference/v1'),
  },
];

/** Default first-party catalog. Retired providers above are intentionally not exposed to onboarding. */
export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'gemini', displayName: 'Google Gemini', onboardingMode: 'assisted',
    signupUrl: 'https://aistudio.google.com/app/apikey', keyUrl: 'https://aistudio.google.com/app/apikey',
    needsPhone: false, needsCard: false, regionNotes: 'Free-tier eligibility is account and region dependent',
    baseUrl: 'https://generativelanguage.googleapis.com', openAiCompatible: false,
    dataPolicyUrl: 'https://ai.google.dev/gemini-api/terms',
    privacyNote: 'Google states that free-tier API content may be used to improve products; review current terms before connecting.',
    pricingNote: 'Free tier availability and limits can change; Companion does not assume a fixed quota.', freeTier: true,
    guideSteps: ['Open Google AI Studio and create an API key', 'Paste it into Companion; it is stored in Windows Credential Manager', 'Companion tests the key before saving it'],
    models: ['gemini-2.5-flash-lite'], lastVerified: '2026-10-26', factory: (key) => createGeminiProvider(key),
  },
  {
    id: 'openrouter', displayName: 'OpenRouter', onboardingMode: 'assisted',
    signupUrl: 'https://openrouter.ai/signup', keyUrl: 'https://openrouter.ai/keys', keyPrefixHint: 'sk-or-',
    needsPhone: false, needsCard: false, regionNotes: 'Free plan and model availability are account and provider dependent',
    baseUrl: 'https://openrouter.ai/api/v1', openAiCompatible: true, dataPolicyUrl: 'https://openrouter.ai/privacy',
    privacyNote: 'Routes prompts to the selected upstream model provider; review the selected model and provider policies.',
    pricingNote: 'Companion discovers models currently priced at zero. Free models can be rate-limited or removed.', freeTier: true,
    guideSteps: ['Create an OpenRouter account', 'Create an API key', 'Use Discover models to choose a currently free model'],
    models: ['openrouter/free'], lastVerified: '2026-10-26',
    factory: (key) => createOpenAiCompatibleProvider('openrouter', 'OpenRouter', key, 'https://openrouter.ai/api/v1'),
  },
  {
    id: 'groq', displayName: 'Groq', onboardingMode: 'assisted',
    signupUrl: 'https://console.groq.com/signup', keyUrl: 'https://console.groq.com/keys', keyPrefixHint: 'gsk_',
    needsPhone: false, needsCard: false, regionNotes: 'Free developer access and limits vary by account and region',
    baseUrl: 'https://api.groq.com/openai/v1', openAiCompatible: true, dataPolicyUrl: 'https://groq.com/privacy-policy/',
    privacyNote: 'Fast hosted inference; review Groq and model-provider data policies before sending private content.',
    pricingNote: 'Free developer limits are exposed by the API and may change.', freeTier: true,
    guideSteps: ['Create a Groq account', 'Create an API key', 'Use Discover models to select a live model'],
    models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], lastVerified: '2026-10-26',
    factory: (key) => createOpenAiCompatibleProvider('groq', 'Groq', key, 'https://api.groq.com/openai/v1'),
  },
  {
    id: 'nvidia', displayName: 'NVIDIA API Catalog', onboardingMode: 'assisted',
    signupUrl: 'https://build.nvidia.com/', keyUrl: 'https://build.nvidia.com/settings/api-keys',
    needsPhone: false, needsCard: false, regionNotes: 'Free developer access is intended for prototyping and subject to endpoint limits',
    baseUrl: 'https://integrate.api.nvidia.com/v1', openAiCompatible: true, dataPolicyUrl: 'https://www.nvidia.com/en-us/about-nvidia/privacy-policy/',
    privacyNote: 'Hosted NVIDIA inference; review NVIDIA API trial terms and model policies.',
    pricingNote: 'NVIDIA provides free prototype access, but rate limits and model availability are not guaranteed.', freeTier: true,
    guideSteps: ['Create a free NVIDIA Developer account', 'Create an API key at build.nvidia.com', 'Use Discover models to choose an available model'],
    models: ['nvidia/llama-3.1-nemotron-ultra-253b-v1'], lastVerified: '2026-10-26',
    factory: (key) => createOpenAiCompatibleProvider('nvidia', 'NVIDIA API Catalog', key, 'https://integrate.api.nvidia.com/v1'),
  },
  {
    id: 'deepseek', displayName: 'DeepSeek', onboardingMode: 'assisted',
    signupUrl: 'https://platform.deepseek.com/sign_up', keyUrl: 'https://platform.deepseek.com/api_keys',
    needsPhone: false, needsCard: false, regionNotes: 'Account and regional availability apply',
    baseUrl: 'https://api.deepseek.com', openAiCompatible: true,
    dataPolicyUrl: 'https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html',
    privacyNote: 'Review DeepSeek retention and training terms before sending private content.',
    pricingNote: 'API usage is not assumed free; use an account with available credits or a current allowance.', freeTier: false,
    guideSteps: ['Create or sign in to DeepSeek Platform', 'Create an API key', 'Paste it into Companion; it is stored in Windows Credential Manager'],
    models: ['deepseek-v4-flash'], lastVerified: '2026-10-26', factory: (key) => createOpenAiCompatibleProvider('deepseek', 'DeepSeek', key, 'https://api.deepseek.com'),
  },
  {
    id: 'openai', displayName: 'OpenAI / ChatGPT', onboardingMode: 'assisted',
    signupUrl: 'https://platform.openai.com/signup', keyUrl: 'https://platform.openai.com/api-keys',
    needsPhone: false, needsCard: true, regionNotes: 'OpenAI API access and billing are separate from a ChatGPT subscription',
    baseUrl: 'https://api.openai.com/v1', openAiCompatible: true,
    dataPolicyUrl: 'https://openai.com/policies/row-privacy-policy/',
    privacyNote: 'This uses the OpenAI API, not a ChatGPT web session.', pricingNote: 'Paid API service; a ChatGPT subscription does not automatically provide API credits.', freeTier: false,
    guideSteps: ['Create or sign in to OpenAI Platform', 'Create an API key', 'Paste it into Companion; it is stored in Windows Credential Manager'],
    models: ['gpt-5.2', 'gpt-5-mini'], lastVerified: '2026-10-26', factory: (key) => createOpenAiCompatibleProvider('openai', 'OpenAI / ChatGPT', key, 'https://api.openai.com/v1'),
  },
  {
    id: 'anthropic', displayName: 'Anthropic / Claude', onboardingMode: 'assisted',
    signupUrl: 'https://console.anthropic.com/', keyUrl: 'https://console.anthropic.com/settings/keys',
    needsPhone: false, needsCard: true, regionNotes: 'API access depends on Anthropic account and regional eligibility',
    baseUrl: 'https://api.anthropic.com', openAiCompatible: false, dataPolicyUrl: 'https://www.anthropic.com/legal/privacy',
    privacyNote: 'Uses Anthropic’s Messages API directly; separate from the Claude consumer app.', pricingNote: 'Paid API service; no free API quota is assumed.', freeTier: false,
    guideSteps: ['Create or sign in to Anthropic Console', 'Create a key under API keys', 'Paste it into Companion; it is stored in Windows Credential Manager'],
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5'], lastVerified: '2026-10-26', factory: (key) => createAnthropicProvider(key),
  },
  {
    id: 'perplexity', displayName: 'Perplexity', onboardingMode: 'assisted',
    signupUrl: 'https://www.perplexity.ai/', keyUrl: 'https://www.perplexity.ai/settings/api',
    needsPhone: false, needsCard: true, regionNotes: 'API access depends on Perplexity account settings',
    baseUrl: 'https://api.perplexity.ai', openAiCompatible: true, dataPolicyUrl: 'https://www.perplexity.ai/hub/legal/privacy-policy',
    privacyNote: 'Perplexity answers may be web-grounded; review the provider’s current policy.', pricingNote: 'Paid API service; search/model usage may have separate limits.', freeTier: false,
    guideSteps: ['Open Perplexity API settings', 'Create an API key', 'Paste it into Companion; it is stored in Windows Credential Manager'],
    models: ['sonar'], lastVerified: '2026-10-26', factory: (key) => createOpenAiCompatibleProvider('perplexity', 'Perplexity', key, 'https://api.perplexity.ai'),
  },
];

void RETIRED_PROVIDER_CATALOG;
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
    const started = Date.now();
    try {
      const response = await fetch(this.baseUrl + '/models', {
        headers: { Authorization: 'Bearer ' + this.apiKey },
        signal: AbortSignal.timeout(30000),
      });
      return {
        healthy: response.ok,
        lastCheck: Date.now(),
        latency: Date.now() - started,
        error: response.ok ? undefined : classifyHttpError(response.status, 'HTTP ' + response.status),
      };
    } catch (error) {
      return { healthy: false, lastCheck: Date.now(), latency: Date.now() - started, error: new ProviderError('network', String(error), true) };
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
      throw classifyHttpError(response.status, text, response.headers.get('retry-after'));
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
      throw classifyHttpError(response.status, text, response.headers.get('retry-after'));
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

/** Gemini's REST API is intentionally kept separate from OpenAI-compatible APIs. */
class GeminiProvider implements ChatProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';
  private selectedModel: string | undefined;

  constructor(private readonly apiKey: string) {}

  async capabilities(): Promise<ProviderCapabilities> {
    return { streaming: false, maxContextLength: 1_048_576, functionCalling: true, vision: true, jsonMode: true };
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    try {
      const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.apiKey)}`, {
        headers: { 'x-goog-api-key': this.apiKey },
        signal: AbortSignal.timeout(30000),
      });
      if (!modelsResponse.ok) {
        const detail = await modelsResponse.text();
        return { healthy: false, lastCheck: Date.now(), latency: Date.now() - started, error: classifyHttpError(modelsResponse.status, detail, modelsResponse.headers.get('retry-after')) };
      }
      const listed = await modelsResponse.json() as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
      const candidates = (listed.models ?? [])
        .filter((model) => model.name && model.supportedGenerationMethods?.includes('generateContent'))
        .map((model) => model.name!.replace(/^models\//, ''));
      const preferred = ['gemini-3.5-flash-lite', 'gemini-3.8-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];
      this.selectedModel = preferred.find((model) => candidates.includes(model)) ?? candidates[0];
      if (!this.selectedModel) {
        return { healthy: false, lastCheck: Date.now(), latency: Date.now() - started, error: new ProviderError('bad_request', 'This Gemini key exposes no model supporting generateContent.') };
      }
      // Listing models with the authenticated key is sufficient for health
      // validation. Do not spend a second request on a synthetic generation
      // probe: the router calls healthCheck before every message, and that
      // extra probe can time out or consume free-tier quota immediately before
      // the real request (especially in voice mode).
      return { healthy: true, lastCheck: Date.now(), latency: Date.now() - started };
    } catch (error) {
      return { healthy: false, lastCheck: Date.now(), latency: Date.now() - started, error: new ProviderError('network', String(error), true) };
    }
  }

  async complete(request: ChatCompletionRequest, signal: AbortSignal): Promise<ChatCompletionResponse> {
    const model = this.selectedModel ?? request.model;
    const system = request.messages.find((message) => message.role === 'system')?.content;
    const contents = request.messages.filter((message) => message.role !== 'system').map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
    const response = await fetch(`${this.endpoint(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { temperature: request.temperature, maxOutputTokens: request.maxTokens, ...(request.jsonMode ? { responseMimeType: 'application/json' } : {}) },
      }),
      signal,
    });
    if (!response.ok) throw classifyHttpError(response.status, await response.text(), response.headers.get('retry-after'));
    const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
    const candidate = data.candidates?.[0];
    return {
      model,
      content: candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '',
      finishReason: candidate?.finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
      usage: data.usageMetadata ? { promptTokens: data.usageMetadata.promptTokenCount ?? 0, completionTokens: data.usageMetadata.candidatesTokenCount ?? 0, totalTokens: data.usageMetadata.totalTokenCount ?? 0 } : undefined,
    };
  }

  async *stream(request: ChatCompletionRequest, signal: AbortSignal): AsyncIterable<ChatCompletionChunk> {
    const response = await this.complete(request, signal);
    yield { delta: response.content, finishReason: response.finishReason };
  }

  private endpoint(model: string): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  }
}

function createGeminiProvider(apiKey: string): ChatProvider {
  return new GeminiProvider(apiKey);
}

class AnthropicProvider implements ChatProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic / Claude';

  constructor(private readonly apiKey: string) {}

  async capabilities(): Promise<ProviderCapabilities> {
    return { streaming: false, maxContextLength: 1_000_000, functionCalling: true, vision: true, jsonMode: false };
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    try {
      const response = await this.request({ model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 4 }, AbortSignal.timeout(10000));
      return { healthy: response.ok, lastCheck: Date.now(), latency: Date.now() - started, error: response.ok ? undefined : classifyHttpError(response.status, `HTTP ${response.status}`, response.headers.get('retry-after')) };
    } catch (error) {
      return { healthy: false, lastCheck: Date.now(), latency: Date.now() - started, error: new ProviderError('network', String(error), true) };
    }
  }

  async complete(request: ChatCompletionRequest, signal: AbortSignal): Promise<ChatCompletionResponse> {
    const system = request.messages.find((message) => message.role === 'system')?.content;
    const messages = request.messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }));
    const response = await this.request({ model: request.model, max_tokens: request.maxTokens ?? 1024, ...(system ? { system } : {}), messages }, signal);
    if (!response.ok) throw classifyHttpError(response.status, await response.text(), response.headers.get('retry-after'));
    const data = await response.json() as { content?: Array<{ type: string; text?: string }>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      model: request.model,
      content: data.content?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('') ?? '',
      finishReason: data.stop_reason === 'max_tokens' ? 'length' : 'stop',
      usage: data.usage ? { promptTokens: data.usage.input_tokens ?? 0, completionTokens: data.usage.output_tokens ?? 0, totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) } : undefined,
    };
  }

  async *stream(request: ChatCompletionRequest, signal: AbortSignal): AsyncIterable<ChatCompletionChunk> {
    const response = await this.complete(request, signal);
    yield { delta: response.content, finishReason: response.finishReason };
  }

  private request(body: Record<string, unknown>, signal: AbortSignal): Promise<Response> {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body), signal,
    });
  }
}

function createAnthropicProvider(apiKey: string): ChatProvider {
  return new AnthropicProvider(apiKey);
}

function classifyHttpError(status: number, message: string, retryAfterHeader?: string | null): ProviderError {
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : undefined;
  if (status === 401) return new ProviderError('auth_invalid', message, false);
  if (status === 402) return new ProviderError('quota_exhausted', message, false);
  if (status === 403) return new ProviderError('region_blocked', message, false);
  if (status === 408 || status === 504) return new ProviderError('timeout', message, true, retryAfter);
  if (status === 429) return new ProviderError('rate_limited', message, true, Number.isFinite(retryAfter) ? retryAfter : 60);
  if (status === 400) return new ProviderError('bad_request', message, false);
  if (status >= 500) return new ProviderError('provider_down', message, true, retryAfter);
  return new ProviderError('unknown', message, false);
}

export function createCustomOpenAiProvider(id: string, name: string, apiKey: string, baseUrl: string): ChatProvider {
  return new OpenAiCompatibleProvider(id, name, apiKey, baseUrl);
}

const createOpenAiCompatibleProvider = createCustomOpenAiProvider;

export interface CustomProviderConfig {
  name: string;
  baseUrl: string;
  model: string;
}

/** Encodes non-secret custom-provider settings into the Credential Manager target name. */
export function encodeCustomProviderId(config: CustomProviderConfig): string {
  const payload = Buffer.from(JSON.stringify(config), 'utf8').toString('base64url');
  return `custom-${payload}`;
}

export function decodeCustomProviderId(id: string): CustomProviderConfig | undefined {
  if (!id.startsWith('custom-')) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(id.slice(7), 'base64url').toString('utf8')) as Partial<CustomProviderConfig>;
    if (typeof parsed.name !== 'string' || typeof parsed.baseUrl !== 'string' || typeof parsed.model !== 'string') return undefined;
    const url = new URL(parsed.baseUrl);
    if (url.protocol !== 'https:') return undefined;
    return { name: parsed.name.slice(0, 80), baseUrl: url.toString().replace(/\/$/, ''), model: parsed.model.slice(0, 160) };
  } catch {
    return undefined;
  }
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

export interface DiscoveredModel {
  id: string;
  name: string;
  providerId: string;
  free: boolean;
  contextLength?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
  inputPrice?: number;
  outputPrice?: number;
}

function numericPrice(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Fetch and normalize the provider's current model list. */
export async function discoverProviderModels(providerId: string, apiKey: string): Promise<DiscoveredModel[]> {
  const entry = getProviderEntry(providerId);
  if (!entry) throw new ProviderError('bad_request', 'Unknown provider: ' + providerId);
  if (!apiKey.trim()) throw new ProviderError('auth_invalid', 'API key is empty');

  if (providerId === 'gemini') {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey), {
      headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw classifyHttpError(response.status, await response.text(), response.headers.get('retry-after'));
    const body = await response.json() as { models?: Array<{ name?: string; displayName?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[] }> };
    return (body.models ?? [])
      .filter((model) => model.name && model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => ({
        id: model.name!.replace(/^models\//, ''), name: model.displayName || model.name!.replace(/^models\//, ''),
        providerId, free: true, contextLength: model.inputTokenLimit, supportsTools: true, supportsVision: true,
      }));
  }

  const response = await fetch(entry.baseUrl + '/models', {
    headers: { Authorization: 'Bearer ' + apiKey }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw classifyHttpError(response.status, await response.text(), response.headers.get('retry-after'));
  const body = await response.json() as {
    data?: Array<{
      id?: string; name?: string; context_length?: number; context_window?: number;
      pricing?: { prompt?: unknown; completion?: unknown }; supported_parameters?: string[];
      architecture?: { input_modalities?: string[] };
    }>;
  };
  const discovered = (body.data ?? []).filter((model) => model.id).map((model) => {
    const inputPrice = numericPrice(model.pricing?.prompt);
    const outputPrice = numericPrice(model.pricing?.completion);
    const free = providerId === 'openrouter'
      ? (model.id!.endsWith(':free') || (inputPrice === 0 && outputPrice === 0))
      : true;
    return {
      id: model.id!, name: model.name || model.id!, providerId, free,
      contextLength: model.context_length ?? model.context_window,
      supportsTools: model.supported_parameters?.includes('tools'),
      supportsVision: model.architecture?.input_modalities?.includes('image'),
      inputPrice, outputPrice,
    };
  });
  const freeModels = providerId === 'openrouter' ? discovered.filter((model) => model.free) : discovered;
  return freeModels.length > 0
    ? freeModels
    : entry.models.map((id) => ({ id, name: id, providerId, free: entry.freeTier }));
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
