import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function isWindows(): boolean {
  return process.platform === 'win32';
}

export async function openTarget(target: string): Promise<void> {
  if (!target || typeof target !== 'string') throw new Error('target required');
  if (isWindows()) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', reject);
      child.unref();
      setTimeout(resolve, 150);
    });
    return;
  }
  // fallback for non-windows dev/test
  await execFileAsync('xdg-open', [target]).catch(() => undefined);
}

export async function playMedia(target: string): Promise<void> {
  // Default media player via OS open
  await openTarget(target);
}

export async function speakText(text: string, voice?: string): Promise<void> {
  if (!text || typeof text !== 'string') throw new Error('text required');
  const safe = text.replace(/'/g, "''").replace(/\r?\n/g, ' ');
  const voiceCmd = voice ? `$s.SelectVoice('${voice.replace(/'/g, "''")}');` : '';
  const script = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voiceCmd} $s.Speak('${safe}');`;
  if (isWindows()) {
    await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 60_000 });
    return;
  }
  // non-windows: best-effort via espeak if available
  try { await execFileAsync('espeak', [text]); } catch { /* ignore */ }
}

export async function makeCall(number: string): Promise<void> {
  if (!number || typeof number !== 'string') throw new Error('number required');
  const cleaned = number.replace(/[^\d+]/g, '');
  await openTarget(`tel:${cleaned}`);
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runCommand(command: string, args: string[] = [], timeoutMs = 30_000): Promise<RunCommandResult> {
  if (!command || typeof command !== 'string') throw new Error('command required');
  return new Promise<RunCommandResult>((resolve) => {
    const child = spawn(command, args, { shell: true, windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      resolve({ stdout, stderr: stderr + '\n[timed out]', code: -1 });
    }, timeoutMs);
    child.stdout?.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + '\n' + String(e), code: -1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}
