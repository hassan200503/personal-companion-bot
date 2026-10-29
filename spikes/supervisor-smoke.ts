import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSupervisor } from '../companion/apps/desktop/src/main/supervisor.js';

const dir = mkdtempSync(join(tmpdir(), 'companion-supervisor-'));
const marker = join(dir, 'restarted.txt');
const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { windowsHide: true, stdio: 'ignore' });
if (!child.pid) throw new Error('fixture_pid_missing');
process.env.COMPANION_TRACKED_PID = String(child.pid);
const now = Date.now();
writeFileSync(join(dir, 'heartbeat.json'), JSON.stringify({ pid: child.pid, at: now }), 'utf8');
writeFileSync(join(dir, 'crash-marker.json'), JSON.stringify({ pid: child.pid, at: now, reason: 'fixture_crash' }), 'utf8');
try {
  await runSupervisor({
    userDataDir: dir,
    appExecutable: process.execPath,
    appArguments: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'restarted')`],
    pollMs: 20,
  });
  const deadline = Date.now() + 5_000;
  while (!existsSync(marker) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  if (!existsSync(marker)) throw new Error('restart_fixture_timeout');
  console.log(JSON.stringify({ restarted: existsSync(marker), actionMarker: readFileSync(marker, 'utf8').trim() }));
} finally {
  try { child.kill(); } catch { /* fixture already exited */ }
  rmSync(dir, { recursive: true, force: true });
}
