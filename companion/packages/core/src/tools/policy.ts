import { createHash } from 'node:crypto';
import type {
  PolicyEngine,
  ToolCallRequest,
  ToolDefinition,
  ToolExecutionContext,
  ToolPolicyDecision,
} from './contracts.js';
import { DEFAULT_RATE_LIMITS } from './rate-limiter.js';
import { TrustedIntentGuard, type EnvironmentSnapshot, type SensitiveTarget } from '../security/index.js';
import { verifyPolicyBundle } from '../security/policy-bundle.js';

function targetFromInput(input: unknown, environment?: EnvironmentSnapshot): SensitiveTarget {
  const record = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const firstString = (keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    return undefined;
  };

  return {
    processName: environment?.foregroundProcess,
    windowTitle: environment?.foregroundTitle,
    target: firstString(['target', 'url', 'contact', 'number', 'command', 'app', 'path']),
  };
}

export class DefaultPolicyEngine implements PolicyEngine {
  private readonly guard: TrustedIntentGuard;

  constructor(guard: TrustedIntentGuard = new TrustedIntentGuard()) {
    this.guard = guard;
  }

  evaluate(request: ToolCallRequest, tool: ToolDefinition<unknown, unknown>, ctx: ToolExecutionContext): ToolPolicyDecision {
    if (!verifyPolicyBundle()) {
      return { allowed: false, requiresConfirmation: false, reason: 'policy_bundle_integrity_failed' };
    }
    // Class 4 restricted: blocked in code
    if (tool.riskClass === 4) {
      return { allowed: false, requiresConfirmation: false, reason: 'restricted_tool_blocked' };
    }

    // version check
    if (request.toolVersion && request.toolVersion !== tool.version) {
      return { allowed: false, requiresConfirmation: false, reason: 'version_mismatch' };
    }

    // platform check
    if (!tool.platforms.includes('all') && !tool.platforms.includes(ctx.platform)) {
      return { allowed: false, requiresConfirmation: false, reason: 'platform_not_supported' };
    }

    // permission check
    for (const perm of tool.requiredPermissions) {
      if (!ctx.permissions.has(perm)) {
        return { allowed: false, requiresConfirmation: false, reason: `missing_permission:${perm}` };
      }
    }

    // schema validation
    const parsed = tool.inputSchema.safeParse(request.input);
    if (!parsed.success) {
      return { allowed: false, requiresConfirmation: false, reason: 'invalid_input' };
    }

    // allow-list checker
    if (ctx.allowListChecker) {
      const r = ctx.allowListChecker(tool.name, request.input);
      if (!r.ok) {
        return { allowed: false, requiresConfirmation: false, reason: r.reason ?? 'allowlist_denied' };
      }
    }

    // rate limit
    if (ctx.rateLimiter) {
      const key = `${request.requestedBy ?? 'anon'}:${tool.name}`;
      // Use risk class to determine rate limit
      const config = DEFAULT_RATE_LIMITS[tool.riskClass] ?? DEFAULT_RATE_LIMITS[3];
      if (config && !ctx.rateLimiter.allow(key, config.maxCalls, config.windowMs)) {
        return { allowed: false, requiresConfirmation: false, reason: 'rate_limited' };
      }
    }

    const source =
      request.intentSource ??
      (request.trust === 'untrusted' ? 'untrusted_content' : 'owner_ui');
    const environment = ctx.environment ?? (tool.name.startsWith('os.')
      ? { screenLocked: true, secureDesktop: true, probeFailed: true }
      : { screenLocked: false, secureDesktop: false });
    const authorization = this.guard.authorize({
      source,
      riskClass: tool.riskClass,
      environment,
      target: targetFromInput(request.input, environment),
    });

    if (!authorization.allowed) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: authorization.reason ?? 'intent_denied',
      };
    }

    // Every class 3 action needs confirmation, regardless of the tool's default.
    const requiresConfirmation =
      authorization.requiresConfirmation ||
      tool.requiresConfirmation === true ||
      tool.riskClass >= 3;

    // action hash for confirmation binding
    const actionHash = createHash('sha256')
      .update(tool.name)
      .update(tool.version)
      .update(JSON.stringify(request.input ?? {}))
      .update(String(Date.now()))
      .digest('hex');

    return { allowed: true, requiresConfirmation, actionHash };
  }
}
