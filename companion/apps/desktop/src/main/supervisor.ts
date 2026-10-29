import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SupervisorOptions {
  userDataDir: string;
  appExecutable: string;
  appArguments: readonly string[];
  heartbeatTimeoutMs?: number;
  pollMs?: number;
  maxRestarts?: number;
  windowMs?: number;
}

interface Marker { pid?: number; at?: number; reason?: string }

export function decideSupervisorAction(
  now: number,
  trackedPid: number,
  heartbeat: Marker | undefined,
  crash: Marker | undefined,
  stop: Marker | undefined,
  restarts: readonly number[],
  options: Pick<SupervisorOptions, 'heartbeatTimeoutMs' | 'maxRestarts' | 'windowMs'> = {}
): 'wait' | 'restart_crash' | 'restart_hang' | 'exit' {
  if (stop) return 'exit';
  const maxRestarts = options.maxRestarts ?? 3;
  const windowMs = options.windowMs ?? 10 * 60 * 1000;
  const recent = restarts.filter((time) => now - time < windowMs);
  if (recent.length >= maxRestarts) return 'exit';
  if (crash) return 'restart_crash';
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 15_000;
  const heartbeatAt = heartbeat?.at ?? 0;
  if (heartbeatAt > 0 && now - heartbeatAt > heartbeatTimeoutMs && processAlive(trackedPid)) return 'restart_hang';
  if (!processAlive(trackedPid)) return 'exit';
  return 'wait';
}

export async function runSupervisor(options: SupervisorOptions): Promise<void> {
  const heartbeatPath = join(options.userDataDir, 'heartbeat.json');
  const crashPath = join(options.userDataDir, 'crash-marker.json');
  const stopPath = join(options.userDataDir, 'stop-marker.json');
  const trackedPid = Number(process.env.COMPANION_TRACKED_PID ?? 0);
  if (!trackedPid) return;
  const restarts: number[] = [];
  const pollMs = options.pollMs ?? 2_000;

  while (true) {
    await delay(pollMs);
    const now = Date.now();
    const action = decideSupervisorAction(now, trackedPid, readMarker(heartbeatPath), readMarker(crashPath), readMarker(stopPath), restarts, options);
    if (action === 'wait') continue;
    if (action === 'exit') return;
    if (action === 'restart_hang') {
      try { execFileSync('taskkill.exe', ['/PID', String(trackedPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { return; }
      try { writeFileSync(crashPath, JSON.stringify({ pid: trackedPid, at: now, reason: 'supervisor_hang' }), 'utf8'); } catch { return; }
    }
    restarts.push(now);
    const child = spawn(options.appExecutable, options.appArguments, { detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
    return;
  }
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readMarker(path: string): Marker | undefined {
  if (!existsSync(path)) return undefined;
  try { return JSON.parse(readFileSync(path, 'utf8')) as Marker; } catch { return undefined; }
}

function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

if (process.argv[1]?.endsWith('supervisor.js')) {
  const userDataDir = process.argv[2];
  const appExecutable = process.argv[3];
  const encodedArgs = process.argv[4];
  if (userDataDir && appExecutable) {
    const appArguments = encodedArgs ? JSON.parse(Buffer.from(encodedArgs, 'base64').toString('utf8')) as string[] : [];
    void runSupervisor({ userDataDir, appExecutable, appArguments });
  }
}
