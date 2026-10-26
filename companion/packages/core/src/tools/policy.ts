import { createHash } from 'node:crypto';
import type {
  PolicyEngine,
  ToolCallRequest,
  ToolDefinition,
  ToolExecutionContext,
  ToolPolicyDecision,
} from './contracts.js';

export class DefaultPolicyEngine implements PolicyEngine {
  evaluate(request: ToolCallRequest, tool: ToolDefinition<unknown, unknown>, ctx: ToolExecutionContext): ToolPolicyDecision {
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
    if (ctx.rateLimiter && tool.requiredPermissions.length >= 0) {
      const key = `${request.requestedBy ?? 'anon'}:${tool.name}`;
      // default 60/min
      if (!ctx.rateLimiter.allow(key, 60, 60_000)) {
        return { allowed: false, requiresConfirmation: false, reason: 'rate_limited' };
      }
    }

    // confirmation determination
    let requiresConfirmation = tool.requiresConfirmation ?? tool.riskClass >= 3;
    if (request.trust === 'untrusted' && tool.riskClass >= 2) {
      requiresConfirmation = true;
    }

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

