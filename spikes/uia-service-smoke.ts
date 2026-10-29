import { execFileSync, spawn } from 'node:child_process';
import { probeUiAutomation } from '../companion/packages/core/src/os-control/uia.js';

const before = new Set([...execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq notepad.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).matchAll(/"notepad\.exe","(\d+)"/gi)].map((match) => Number(match[1])));
const child = spawn('notepad.exe', [], { windowsHide: false });
if (!child.pid) throw new Error('notepad_pid_missing');
await new Promise((resolve) => setTimeout(resolve, 1500));
try {
  const all = [...execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq notepad.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).matchAll(/"notepad\.exe","(\d+)"/gi)].map((match) => Number(match[1]));
  const processId = all.find((pid) => !before.has(pid)) ?? all[0];
  if (!processId) throw new Error('notepad_window_process_missing');
  const result = await probeUiAutomation(processId, 8000, 'Notepad');
  console.log(JSON.stringify({ processId: result.processId, descendantCount: result.descendantCount, controls: result.controls.length }));
} finally {
  if (!before.has(child.pid)) {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* process may already be gone */ }
  }
}
