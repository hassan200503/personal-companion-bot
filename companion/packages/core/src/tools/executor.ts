import type {
  ToolCallRequest,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolExecutor,
  ToolRegistry,
  PolicyEngine,
  ConfirmationManager,
} from './contracts.js';
import { DefaultPolicyEngine } from './policy.js';

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export class DefaultToolExecutor implements ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly policy: PolicyEngine = new DefaultPolicyEngine(),
    private readonly confirmation: ConfirmationManager
  ) {}

  async execute(request: ToolCallRequest, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const tool = this.registry.get(request.toolName, request.toolVersion);
    if (!tool) {
      ctx.audit.record({ action: `tool:${request.toolName}`, outcome: 'not_found', detail: { reason: 'unknown_tool' }, createdAt: ctx.now().toISOString() });
      return { status: 'denied', error: 'unknown_tool' };
    }

    const decision = this.policy.evaluate(request, tool, ctx);

    if (!decision.allowed) {
      ctx.audit.record({ action: `tool:${tool.name}`, outcome: 'denied', detail: { reason: decision.reason }, createdAt: ctx.now().toISOString() });
      return { status: 'denied', error: decision.reason, actionHash: decision.actionHash };
    }

    // confirmation flow
    if (decision.requiresConfirmation) {
      if (request.confirmationHash) {
        const pending = this.confirmation.get(request.confirmationHash);
        if (pending?.consumed) {
          ctx.audit.record({ action: `tool:${tool.name}`, outcome: 'duplicate', detail: { actionHash: request.confirmationHash }, createdAt: ctx.now().toISOString() });
          return { status: 'duplicate', error: 'duplicate_action', actionHash: request.confirmationHash };
        }
        if (!pending) {
          ctx.audit.record({ action: `tool:${tool.name}`, outcome: 'denied', detail: { reason: 'confirmation_not_valid' }, createdAt: ctx.now().toISOString() });
          return { status: 'denied', error: 'confirmation_not_valid', actionHash: request.confirmationHash };
        }
        if (
          pending.toolName !== tool.name ||
          pending.toolVersion !== tool.version ||
          canonicalJson(pending.input) !== canonicalJson(request.input)
        ) {
          ctx.audit.record({ action: `tool:${tool.name}`, outcome: 'denied', detail: { reason: 'confirmation_mismatch' }, createdAt: ctx.now().toISOString() });
          return { status: 'denied', error: 'confirmation_mismatch', actionHash: request.confirmationHash };
        }
        if (!this.confirmation.isConfirmed(request.confirmationHash)) {
          ctx.audit.record({ action: `tool:${tool.name}`, outcome: 'denied', detail: { reason: 'confirmation_not_valid' }, createdAt: ctx.now().toISOString() });
          return { status: 'denied', error: 'confirmation_not_valid', actionHash: request.confirmationHash };
        }
        this.confirmation.markConsumed(request.confirmationHash);
      } else {
        const pending = this.confirmation.createPending(tool.name, tool.version, request.input);
        ctx.audit.record({ action: `tool:${tool.name}`, outcome: 'needs_confirmation', detail: { actionHash: pending.actionHash }, createdAt: ctx.now().toISOString() });
        return { status: 'needs_confirmation', actionHash: pending.actionHash };
      }
    }
    // execute with timeout — abort the shared signal so child work can stop
    let timer: NodeJS.Timeout | null = null;
    const timeoutController = new AbortController();
    const onParentAbort = () => timeoutController.abort();
    if (ctx.signal.aborted) timeoutController.abort();
    else ctx.signal.addEventListener('abort', onParentAbort, { once: true });
    const timedCtx = { ...ctx, signal: timeoutController.signal };
    try {
      const execPromise = tool.execute(timedCtx, request.input as never);
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timeoutController.abort();
          reject(new Error('timeout'));
        }, tool.timeoutMs);
      });
      const result = await Promise.race([execPromise, timeoutPromise]);
      // validate output
      const outParsed = tool.outputSchema.safeParse(result);
      if (!outParsed.success) {
        throw new Error('invalid_output');
      }
      if (tool.postcondition && !(await tool.postcondition(timedCtx, request.input as never, result as never))) {
        throw new Error('postcondition_unverified');
      }
      timedCtx.audit.record({ action: `tool:${tool.name}`, outcome: 'completed', detail: { audit: tool.audit }, createdAt: timedCtx.now().toISOString() });
      return { status: 'completed', result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      timedCtx.audit.record({ action: `tool:${tool.name}`, outcome: 'failed', detail: { error: message }, createdAt: timedCtx.now().toISOString() });
      return { status: 'failed', error: message };
    } finally {
      if (timer) clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onParentAbort);
    }
  }
}



