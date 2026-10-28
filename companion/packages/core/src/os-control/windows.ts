import { spawn } from 'node:child_process';

export async function openTarget(target: string): Promise<{ opened: boolean; resolved?: string; error?: string }> {
  const t = target.trim();
  if (!t) return { opened: false, error: 'empty_target' };

  const runStart = async (x: string) => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const child = spawn('cmd', ['/c', 'start', '', x], { windowsHide: true });
      let err = '';
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` }));
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
    });
  };

  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || (await import('node:fs')).existsSync(t)) {
    const r = await runStart(t);
    return r.ok ? { opened: true, resolved: t } : { opened: false, error: r.error };
  }

  const aliases: Record<string, string> = {
    notepad: 'notepad', calculator: 'calc', calc: 'calc', paint: 'mspaint', mspaint: 'mspaint',
    explorer: 'explorer', files: 'explorer', camera: 'microsoft.windows.camera:', photos: 'ms-photos:',
    settings: 'ms-settings:', store: 'ms-windows-store:', whatsapp: 'whatsapp:', browser: 'https://www.google.com',
    edge: 'msedge', chrome: 'chrome', youtube: 'https://www.youtube.com',
  };
  let alias = aliases[t.toLowerCase()];
  if (!alias) {
    const lower = t.toLowerCase();
    for (const key of Object.keys(aliases)) {
      if (lower.includes(key)) { alias = aliases[key]; break; }
    }
  }
  if (alias) {
    const r = await runStart(alias);
    if (r.ok) return { opened: true, resolved: alias };
  }

  let r = await runStart(t);
  if (r.ok) return { opened: true, resolved: t };

  try {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('powershell', [
      '-NoProfile', '-Command',
      `Get-StartApps | Where-Object { $_.Name -like '*${t.replace(/'/g, "''")}*' } | Select-Object -First 1 -ExpandProperty AppID`,
    ], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    const appId = out.trim();
    if (appId) {
      const r2 = await runStart(`shell:AppsFolder\\${appId}`);
      if (r2.ok) return { opened: true, resolved: appId };
    }
  } catch { /* ignore */ }

  return { opened: false, error: r.error ?? 'unable_to_open' };
}

export async function playMedia(target: string): Promise<{ played: boolean; resolved?: string; error?: string }> {
  let t = target.trim();
  if (!t) return { played: false, error: 'empty_target' };

  const { existsSync } = await import('node:fs');
  const pathMod = await import('node:path');

  if (!existsSync(t)) {
    const roots = [
      process.env.USERPROFILE ? pathMod.join(process.env.USERPROFILE, 'Music') : '',
      process.env.USERPROFILE ? pathMod.join(process.env.USERPROFILE, 'Videos') : '',
      process.env.USERPROFILE ? pathMod.join(process.env.USERPROFILE, 'Downloads') : '',
      process.env.USERPROFILE ? pathMod.join(process.env.USERPROFILE, 'Desktop') : '',
      process.env.USERPROFILE ? pathMod.join(process.env.USERPROFILE, 'Documents') : '',
    ].filter(Boolean);
    let found: string | null = null;
    const walk = (dir: string, depth: number): string | null => {
      if (depth < 0) return null;
      try {
        const { readdirSync } = require('node:fs');
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = pathMod.join(dir, entry.name);
          if (entry.isFile() && entry.name.toLowerCase().includes(t.toLowerCase())) return full;
          if (entry.isDirectory()) {
            const r = walk(full, depth - 1);
            if (r) return r;
          }
        }
      } catch { /* ignore */ }
      return null;
    };
    for (const root of roots) {
      if (!existsSync(root)) continue;
      found = walk(root, 3);
      if (found) break;
    }
    if (found) t = found;
    else {
      const q = encodeURIComponent(t.replace(/['"]/g, '').trim());
      const url = `https://www.youtube.com/results?search_query=${q}`;
      const r = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const child = spawn('cmd', ['/c', 'start', '', url], { windowsHide: true });
        let err = '';
        child.stderr.on('data', (d) => { err += d.toString(); });
        child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` }));
        child.on('error', (e) => resolve({ ok: false, error: e.message }));
      });
      return r.ok ? { played: true, resolved: url } : { played: false, error: 'file_not_found' };
    }
  }

  const r = await (async () => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const child = spawn('cmd', ['/c', 'start', '', t], { windowsHide: true });
      let err = '';
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` }));
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
    });
  })();
  return r.ok ? { played: true, resolved: t } : { played: false, error: r.error };
}

export async function speakText(text: string, voice?: string): Promise<{ spoken: boolean; error?: string }> {
  const safe = text.replace(/'/g, "''").replace(/\r?\n/g, ' ');
  const voiceCmd = voice ? `$s.SelectVoice('${voice.replace(/'/g, "''")}');` : '';
  const script = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voiceCmd} $s.Speak('${safe}');`;
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve({ spoken: true });
      else resolve({ spoken: false, error: err.trim() || `exit ${code}` });
    });
    child.on('error', (e) => resolve({ spoken: false, error: e.message }));
  });
}

export async function makeCall(number: string): Promise<{ called: boolean; error?: string }> {
  const cleaned = number.replace(/[^\d+]/g, '');
  const r = await (async () => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const child = spawn('cmd', ['/c', 'start', '', `tel:${cleaned}`], { windowsHide: true });
      let err = '';
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` }));
      child.on('error', (e) => resolve({ ok: false, error: e.message }));
    });
  })();
  return r.ok ? { called: true } : { called: false, error: r.error };
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

export async function takeScreenshot(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const dir = process.env.USERPROFILE ? `${process.env.USERPROFILE}\\Pictures\\Screenshots` : 'C:\\Screenshots';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${dir}\\screenshot-${ts}.png`;
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    `$d = '${dir.replace(/'/g, "''")}'`,
    'if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }',
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$img = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
    '$g = [System.Drawing.Graphics]::FromImage($img)',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
    `$img.Save('${file.replace(/'/g, "''")}')`,
    '$g.Dispose(); $img.Dispose()',
    `Write-Output '${file.replace(/'/g, "''")}'`,
  ].join('; ');
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, path: out.trim() });
      else resolve({ ok: false, error: err.trim() || `exit ${code}` });
    });
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

export async function takePhoto(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const code = [
    'using System;',
    'using System.Runtime.InteropServices.WindowsRuntime;',
    'using Windows.Media.Capture;',
    'using Windows.Media.MediaProperties;',
    'using Windows.Storage;',
    'public class CompanionCam {',
    '  public static string Capture() {',
    '    var mc = new MediaCapture();',
    '    mc.InitializeAsync().AsTask().GetAwaiter().GetResult();',
    '    var props = ImageEncodingProperties.CreateJpeg();',
    '    var folder = KnownFolders.PicturesLibrary;',
    '    var file = folder.CreateFileAsync("companion-photo.jpg", CreationCollisionOption.GenerateUniqueName).AsTask().GetResult();',
    '    mc.CapturePhotoToStorageFileAsync(props, file).AsTask().GetResult();',
    '    mc.Dispose();',
    '    return file.Path;',
    '  }',
    '}',
  ].join('\\n');
  const ps = "$code = '" + code.replace(/'/g, "''") + "';\n" +
    "Add-Type -TypeDefinition $code -ReferencedAssemblies 'C:\\Windows\\System32\\WinMetadata\\Windows.Media.winmd','C:\\Windows\\System32\\WinMetadata\\Windows.Storage.winmd','C:\\Windows\\System32\\WinMetadata\\Windows.Foundation.winmd','System.Runtime.WindowsRuntime';\n" +
    "$p = [CompanionCam]::Capture();\n" +
    "Write-Output $p";
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      const p = out.trim();
      if (code === 0 && p) resolve({ ok: true, path: p });
      else resolve({ ok: false, error: err.trim() || `exit ${code}` });
    });
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}
