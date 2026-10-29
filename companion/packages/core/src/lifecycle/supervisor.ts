export interface SupervisorConfig {
  maxRestarts: number;
  windowMs: number;
  heartbeatTimeoutMs: number;
  backoffMs: number;
}

export interface SupervisorState {
  stopRequested: boolean;
  restartTimes: number[];
}

export interface RestartDecision {
  restart: boolean;
  reason: 'crash' | 'hang' | 'stopped' | 'external_termination' | 'restart_budget_exhausted';
  delayMs: number;
}

export const defaultSupervisorConfig: SupervisorConfig = {
  maxRestarts: 3,
  windowMs: 10 * 60 * 1000,
  heartbeatTimeoutMs: 15_000,
  backoffMs: 1_000
};

export function decideRestart(
  state: SupervisorState,
  event: { kind: 'exit' | 'heartbeat'; now: number; crashMarker: boolean; heartbeatAt?: number; ownerStopped?: boolean },
  config: SupervisorConfig = defaultSupervisorConfig
): RestartDecision {
  if (state.stopRequested || event.ownerStopped) return { restart: false, reason: 'stopped', delayMs: 0 };
  if (event.kind === 'heartbeat' && event.heartbeatAt !== undefined && event.now - event.heartbeatAt <= config.heartbeatTimeoutMs) {
    return { restart: false, reason: 'external_termination', delayMs: 0 };
  }
  if (event.kind === 'exit' && !event.crashMarker) return { restart: false, reason: 'external_termination', delayMs: 0 };
  const recent = state.restartTimes.filter((time) => event.now - time < config.windowMs);
  if (recent.length >= config.maxRestarts) return { restart: false, reason: 'restart_budget_exhausted', delayMs: 0 };
  const reason = event.kind === 'heartbeat' ? 'hang' : 'crash';
  return { restart: true, reason, delayMs: config.backoffMs * (recent.length + 1) };
}
