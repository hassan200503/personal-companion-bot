/**
 * Post-key onboarding pipeline
 *
 * Handles key validation, model listing, health probing, and quota seeding.
 */

import { ProviderError } from './contracts.js';
import { getProviderEntry } from './catalog.js';

export interface KeyValidationResult {
  valid: boolean;
  error?: string;
  providerId: string;
}

export interface ModelListResult {
  models: string[];
  providerId: string;
}

export interface ProbeResult {
  healthy: boolean;
  latency?: number;
  error?: string;
  providerId: string;
}

export interface QuotaSeedResult {
  providerId: string;
  seeded: boolean;
  limits?: Record<string, number>;
}

export interface OnboardingPipeline {
  validateKey(providerId: string, apiKey: string): Promise<KeyValidationResult>;
  listModels(providerId: string, apiKey: string): Promise<ModelListResult>;
  probe(providerId: string, apiKey: string): Promise<ProbeResult>;
  seedQuotas(providerId: string, apiKey?: string): Promise<QuotaSeedResult>;
}

export class DefaultOnboardingPipeline implements OnboardingPipeline {
  async validateKey(providerId: string, apiKey: string): Promise<KeyValidationResult> {
    const entry = getProviderEntry(providerId);
    if (!entry) {
      return { valid: false, error: 'Unknown provider', providerId };
    }

    // Format check
    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, error: 'API key is empty', providerId };
    }

    if (entry.keyPrefixHint && !apiKey.startsWith(entry.keyPrefixHint)) {
      return {
        valid: false,
        error: 'Key should start with "' + entry.keyPrefixHint + '"',
        providerId,
      };
    }

    // Live validation: call health check with the key
    try {
      const provider = entry.factory(apiKey);
      const health = await provider.healthCheck();
      if (!health.healthy) {
        return {
          valid: false,
          error: health.error?.message || 'Provider health check failed',
          providerId,
        };
      }
      return { valid: true, providerId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|aborted/i.test(message)) {
        return {
          valid: false,
          error: 'Gemini could not be reached within 30 seconds. Check your internet connection, VPN/proxy, firewall, or DNS settings, then try again.',
          providerId,
        };
      }
      return { valid: false, error: message, providerId };
    }
  }

  async listModels(providerId: string, apiKey: string): Promise<ModelListResult> {
    const entry = getProviderEntry(providerId);
    if (!entry) {
      throw new ProviderError('bad_request', 'Unknown provider: ' + providerId);
    }

    // Try to fetch models from the provider's /models endpoint
    try {
      const response = await fetch(entry.baseUrl + '/models', {
        headers: { Authorization: 'Bearer ' + apiKey },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = await response.json() as { data?: Array<{ id: string }> };
        if (data.data && Array.isArray(data.data)) {
          const models = data.data.map((m) => m.id).sort();
          return { models, providerId };
        }
      }
    } catch {
      // Fall through to catalog models
    }

    // Fallback to catalog models
    return { models: entry.models, providerId };
  }

  async probe(providerId: string, apiKey: string): Promise<ProbeResult> {
    const entry = getProviderEntry(providerId);
    if (!entry) {
      return { healthy: false, error: 'Unknown provider', providerId };
    }

    const start = Date.now();
    try {
      const provider = entry.factory(apiKey);
      const health = await provider.healthCheck();
      return {
        healthy: health.healthy,
        latency: Date.now() - start,
        error: health.error?.message,
        providerId,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
        providerId,
      };
    }
  }

  async seedQuotas(providerId: string): Promise<QuotaSeedResult> {
    const entry = getProviderEntry(providerId);
    if (!entry) {
      return { providerId, seeded: false };
    }

    // Quota seeding would typically involve calling a usage/billing endpoint
    // For now, we seed with default limits based on provider
    const defaultLimits: Record<string, Record<string, number>> = {
      openrouter: { requestsPerMinute: 200, tokensPerMinute: 200000 },
      groq: { requestsPerMinute: 30, tokensPerMinute: 14400 },
      together: { requestsPerMinute: 60, tokensPerMinute: 60000 },
      fireworks: { requestsPerMinute: 60, tokensPerMinute: 60000 },
    };

    const limits = defaultLimits[providerId] || { requestsPerMinute: 60, tokensPerMinute: 60000 };

    return {
      providerId,
      seeded: true,
      limits,
    };
  }
}
