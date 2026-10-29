import { spawn } from 'node:child_process';
import type { EnvironmentSnapshot } from '@companion/core';

interface ProbeResult {
  screenLocked: boolean;
  process: string;
  title: string;
  integrity: 'low' | 'medium' | 'high' | 'system' | 'unknown';
}

const secureDesktopProcesses = new Set(['logonui', 'consent', 'winlogon', 'lsass']);

function runProbe(): Promise<ProbeResult> {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'using System.Text;',
    'public class CompanionDesktopProbe {',
    '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);',
    '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);',
    '  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);',
    '  [DllImport("user32.dll", SetLastError=true)] public static extern bool CloseDesktop(IntPtr hDesktop);',
    '  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);',
    '  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);',
    '  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr token, int infoClass, IntPtr buffer, int length, out int returned);',
    '  public static string Integrity(uint pid) {',
    '    if (pid == 0) return "unknown";',
    '    var process = OpenProcess(0x1000, false, pid); if (process == IntPtr.Zero) return "unknown";',
    '    IntPtr token; if (!OpenProcessToken(process, 0x0008, out token)) { CloseHandle(process); return "unknown"; }',
    '    int size; GetTokenInformation(token, 25, IntPtr.Zero, 0, out size); var buffer = Marshal.AllocHGlobal(size);',
    '    try { if (!GetTokenInformation(token, 25, buffer, size, out size)) return "unknown"; var sid = Marshal.ReadIntPtr(buffer); var count = Marshal.ReadByte(sid, 1); var level = (uint)Marshal.ReadInt32(sid, 8 + 4 * (count - 1));',
    '      if (level >= 0x4000) return "system"; if (level >= 0x3000) return "high"; if (level >= 0x2000) return "medium"; if (level >= 0x1000) return "low"; return "unknown"; }',
    '    finally { Marshal.FreeHGlobal(buffer); CloseHandle(token); CloseHandle(process); }',
    '  }',
    '}',
    '"@',
    '$hWnd = [CompanionDesktopProbe]::GetForegroundWindow()',
    '$targetPid = 0',
    '[void][CompanionDesktopProbe]::GetWindowThreadProcessId($hWnd, [ref]$targetPid)',
    '$proc = if ($targetPid -gt 0) { Get-Process -Id $targetPid -ErrorAction SilentlyContinue } else { $null }',
    '$sb = New-Object System.Text.StringBuilder 512',
    '[void][CompanionDesktopProbe]::GetWindowText($hWnd, $sb, 512)',
    '$desktop = [CompanionDesktopProbe]::OpenInputDesktop(0, $false, 0x0001)',
    '$locked = $false',
    'if ($desktop -eq [IntPtr]::Zero) { $locked = $true } else { [void][CompanionDesktopProbe]::CloseDesktop($desktop) }',
    '$result = [pscustomobject]@{',
    '  screenLocked = $locked',
    "  process = if ($proc) { $proc.ProcessName } else { '' }",
    '  title = $sb.ToString()',
    '  integrity = [CompanionDesktopProbe]::Integrity($targetPid)',
    '}',
    '$result | ConvertTo-Json -Compress'
  ].join('\n');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      reject(new Error('security_probe_timeout'));
    }, 5000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `security_probe_exit_${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as ProbeResult;
        if (typeof parsed.screenLocked !== 'boolean') throw new Error('invalid_probe_shape');
        resolve({ screenLocked: parsed.screenLocked, process: parsed.process ?? '', title: parsed.title ?? '', integrity: parsed.integrity ?? 'unknown' });
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });
}

let cached: { at: number; snapshot: EnvironmentSnapshot } | null = null;
const CACHE_MS = 400;

export async function probeSecurityEnvironment(options: { fresh?: boolean } = {}): Promise<EnvironmentSnapshot> {
  if (!options.fresh && cached && Date.now() - cached.at < CACHE_MS) {
    return cached.snapshot;
  }

  try {
    const result = await runProbe();
    const processName = result.process.toLowerCase();
    const snapshot: EnvironmentSnapshot = {
      screenLocked: result.screenLocked,
      secureDesktop: result.screenLocked || secureDesktopProcesses.has(processName),
      foregroundProcess: result.process || undefined,
      foregroundTitle: result.title || undefined,
      integrityLevel: result.integrity
    };
    cached = { at: Date.now(), snapshot };
    return snapshot;
  } catch {
    const snapshot: EnvironmentSnapshot = {
      screenLocked: true,
      secureDesktop: true,
      probeFailed: true
    };
    cached = { at: Date.now(), snapshot };
    return snapshot;
  }
}
