import { execFile, spawn, type ChildProcess } from 'node:child_process';
import kill from 'tree-kill';
import { resolveLocalMedia, MediaFallbackChain, type FallbackProvider } from '../media/resolver.js';
import { probeUiAutomation } from './uia.js';
import { ensureStartAppsCache, resolveFromStartAppsCache } from './start-apps-cache.js';
import { MediaIndexer, getDefaultMediaDirectories } from '../media/indexer.js';

// Singleton media indexer for incremental indexing
let mediaIndexer: MediaIndexer | null = null;

function getMediaIndexer(): MediaIndexer {
  if (!mediaIndexer) {
    const directories = getDefaultMediaDirectories();
    mediaIndexer = new MediaIndexer(directories, 3, 500);
  }
  return mediaIndexer;
}

export async function openTarget(target: string, signal?: AbortSignal): Promise<{ opened: boolean; resolved?: string; error?: string; method?: string }> {
  const t = target.trim();
  if (!t) return { opened: false, error: 'empty_target' };
  if (signal?.aborted) return { opened: false, error: 'aborted' };

  const runStart = async (x: string) => {
    return new Promise<{ ok: boolean; error?: string }>((resolve) => {
      if (signal?.aborted) {
        resolve({ ok: false, error: 'aborted' });
        return;
      }
      const child = spawn('cmd', ['/c', 'start', '', x], { windowsHide: true });
      const onAbort = () => {
        try { child.kill(); } catch { /* ignore */ }
        resolve({ ok: false, error: 'aborted' });
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      let err = '';
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` });
      });
      child.on('error', (e) => {
        signal?.removeEventListener('abort', onAbort);
        resolve({ ok: false, error: e.message });
      });
    });
  };

  if (/^[a-z][a-z0-9+.-]*:/i.test(t) || (await import('node:fs')).existsSync(t)) {
    const r = await runStart(t);
    return r.ok ? { opened: true, resolved: t, method: 'direct' } : { opened: false, error: r.error };
  }

  const aliases: Record<string, string> = {
    notepad: 'notepad', calculator: 'calc', calc: 'calc', paint: 'mspaint', mspaint: 'mspaint',
    explorer: 'explorer', files: 'explorer', camera: 'microsoft.windows.camera:', photos: 'ms-photos:',
    settings: 'ms-settings:', store: 'ms-windows-store:', whatsapp: 'whatsapp:', browser: 'https://www.google.com',
    edge: 'msedge', chrome: 'chrome', youtube: 'https://www.youtube.com',
    steam: 'steam://open/games', discord: 'discord:', spotify: 'spotify:',
    game: 'steam://open/games', games: 'steam://open/games',
  };
  let alias = aliases[t.toLowerCase()];
  if (!alias) {
    const lower = t.toLowerCase().replace(/^(the\s+|my\s+)/, '').trim();
    for (const key of Object.keys(aliases)) {
      if (lower === key || lower.includes(key)) { alias = aliases[key]; break; }
    }
  }
  if (alias) {
    const r = await runStart(alias);
    if (r.ok) {
      const expectedProcess = processForAlias(alias);
      if (!expectedProcess || await processExists(expectedProcess)) return { opened: true, resolved: alias, method: 'alias' };
      // start often returns before the process is visible; treat as opened when start succeeded
      return { opened: true, resolved: alias, method: 'alias_unverified' };
    }
  }

  // Prefer cached Start Apps / shortcuts / Steam folders — never block on cold PowerShell here.
  void ensureStartAppsCache();
  const cached = resolveFromStartAppsCache(t.replace(/^(the\s+|my\s+|a\s+)/i, '').replace(/\bgames?\b/gi, '').trim() || t);
  if (cached) {
    const launchTarget = cached.kind === 'start' ? `shell:AppsFolder\\${cached.appId}` : cached.appId;
    const r = await runStart(launchTarget);
    if (r.ok) return { opened: true, resolved: cached.name, method: cached.kind };
  }

  const r = await runStart(t);
  if (r.ok) return { opened: true, resolved: t, method: 'name' };

  // Last resort: wait briefly for cache refresh then retry once.
  try {
    await ensureStartAppsCache(true);
    const again = resolveFromStartAppsCache(t);
    if (again) {
      const launchTarget = again.kind === 'start' ? `shell:AppsFolder\\${again.appId}` : again.appId;
      const r2 = await runStart(launchTarget);
      if (r2.ok) return { opened: true, resolved: again.name, method: again.kind };
    }
  } catch { /* ignore */ }

  return { opened: false, error: r.error ?? 'unable_to_open' };
}

function processForAlias(alias: string): string | undefined {
  const normalized = alias.toLowerCase();
  if (normalized === 'notepad') return 'notepad.exe';
  if (normalized === 'calc') return 'CalculatorApp.exe';
  if (normalized === 'mspaint') return 'mspaint.exe';
  if (normalized === 'explorer') return 'explorer.exe';
  if (normalized === 'msedge') return 'msedge.exe';
  if (normalized === 'chrome') return 'chrome.exe';
  return undefined;
}

function processExists(imageName: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${imageName}`], { windowsHide: true }, (error, stdout) => {
      resolve(!error && new RegExp(`^${imageName.replace('.', '\\.')}(?:\\s|$)`, 'im').test(stdout));
    });
  });
}

export async function playMedia(
  target: string,
  signal?: AbortSignal
): Promise<{ played: boolean; resolved?: string; error?: string; candidates?: string[]; provider?: string }> {
  let t = target.trim();
  if (!t) return { played: false, error: 'empty_target' };
  if (signal?.aborted) return { played: false, error: 'aborted' };

  const { existsSync } = await import('node:fs');

  const runStart = (x: string) => new Promise<{ ok: boolean; error?: string }>((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, error: 'aborted' });
      return;
    }
    const child = spawn('cmd', ['/c', 'start', '', x], { windowsHide: true });
    const onAbort = () => {
      try { child.kill(); } catch { /* ignore */ }
      resolve({ ok: false, error: 'aborted' });
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` });
    });
    child.on('error', (e) => {
      signal?.removeEventListener('abort', onAbort);
      resolve({ ok: false, error: e.message });
    });
  });

  if (!existsSync(t)) {
    // Use incremental media indexer
    const indexer = getMediaIndexer();
    await indexer.updateIndex(); // Incremental update
    const entries = indexer.getEntries();
    const local = resolveLocalMedia(t, entries);
    if (local.status === 'matched') t = local.candidates[0]!.path;
    else if (local.status === 'ambiguous') {
      return { played: false, error: 'ambiguous_local_match', candidates: local.candidates.map((candidate) => candidate.title) };
    } else {
      const q = t.replace(/['"]/g, '').trim();
      const providers: FallbackProvider[] = [
        {
          id: 'spotify',
          search: async (query) => {
            const uri = `spotify:search:${encodeURIComponent(query)}`;
            const r = await runStart(uri);
            if (r.ok) return { opened: true, selectedByOwner: false, url: uri };
            return { opened: false, selectedByOwner: false };
          }
        },
        {
          id: 'youtube',
          search: async (query) => {
            const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
            const r = await runStart(url);
            return r.ok
              ? { opened: true, selectedByOwner: false, url }
              : { opened: false, selectedByOwner: false };
          }
        }
      ];
      const chain = new MediaFallbackChain(providers);
      const fallback = await chain.search(q);
      if (fallback.opened) {
        return {
          played: false,
          resolved: fallback.url,
          provider: fallback.provider,
          error: 'search_page_opened_needs_selection'
        };
      }
      return { played: false, error: fallback.error ?? 'search_page_failed' };
    }
  }

  const r = await runStart(t);
  if (!r.ok) return { played: false, error: r.error };
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { played: true, resolved: t, provider: 'local' };
}

let ttsProcess: ChildProcess | null = null;

export async function speakText(text: string, voice?: string, rate?: number, signal?: AbortSignal): Promise<{ spoken: boolean; error?: string }> {
  if (signal?.aborted) return { spoken: false, error: 'aborted' };
  
  const safe = text.replace(/'/g, "''").replace(/\r?\n/g, ' ');
  const voiceCmd = voice ? `$s.SelectVoice('${voice.replace(/'/g, "''")}');` : '';
  const rateCmd = typeof rate === 'number' ? `$s.Rate = ${Math.max(-10, Math.min(10, Math.round(rate)))};` : '';
  const script = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voiceCmd} ${rateCmd} $s.Speak('${safe}');`;
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
    ttsProcess = child;
    let err = '';
    let settled = false;
    
    const finish = (result: { spoken: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (ttsProcess === child) ttsProcess = null;
      resolve(result);
    };
    
    const onAbort = () => {
      if (child.pid) {
        kill(child.pid, 'SIGKILL', (err) => {
          if (err) {
            try { child.kill('SIGKILL'); } catch { /* ignore */ }
          }
        });
      }
      finish({ spoken: false, error: 'aborted' });
    };
    
    signal?.addEventListener('abort', onAbort, { once: true });
    
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      finish(code === 0 ? { spoken: true } : { spoken: false, error: err.trim() || `exit ${code}` });
    });
    child.on('error', (e) => finish({ spoken: false, error: e.message }));
  });
}

export function stopSpeaking(): { stopped: boolean } {
  if (ttsProcess) {
    try { ttsProcess.kill(); } catch { /* ignore */ }
    ttsProcess = null;
    return { stopped: true };
  }
  return { stopped: false };
}

export async function makeCall(target: string): Promise<{ called: boolean; mode?: 'tel' | 'contact_search'; display?: string; error?: string }> {
  const trimmed = target.trim();
  if (!trimmed) return { called: false, error: 'empty_target' };

  const startUri = async (uri: string): Promise<{ ok: boolean; error?: string }> => new Promise((resolve) => {
    const child = spawn('cmd', ['/c', 'start', '', uri], { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` }));
    child.on('error', (e) => resolve({ ok: false, error: e.message }));
  });

  const digits = trimmed.replace(/[^\d+]/g, '');
  const looksLikeNumber = digits.replace(/\D/g, '').length >= 3 && /^[\d+\s().-]+$/.test(trimmed);
  if (looksLikeNumber) {
    const r = await startUri(`tel:${digits}`);
    return r.ok
      ? { called: true, mode: 'tel', display: digits }
      : { called: false, mode: 'tel', display: digits, error: r.error };
  }

  // Contact names cannot be dialed without owner selection. Open Phone Link and
  // People search so the owner can confirm; never claim the call connected.
  const people = await startUri(`ms-people:search?query=${encodeURIComponent(trimmed)}`);
  const phoneLink = await startUri('ms-phone:');
  if (people.ok || phoneLink.ok) {
    return { called: true, mode: 'contact_search', display: trimmed };
  }
  return {
    called: false,
    mode: 'contact_search',
    display: trimmed,
    error: people.error ?? phoneLink.error ?? 'dialer_unavailable'
  };
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export async function runCommand(command: string, args: string[] = [], timeoutMs = 30_000, signal?: AbortSignal): Promise<RunCommandResult> {
  if (!command || typeof command !== 'string') throw new Error('command required');
  if (signal?.aborted) return { stdout: '', stderr: 'aborted', code: -1 };
  
  return new Promise<RunCommandResult>((resolve) => {
    const child = spawn(command, args, { shell: true, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    
    const finish = (result: RunCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    
    const killTree = () => {
      if (!child.pid) return;
      kill(child.pid, 'SIGKILL', (err) => {
        if (err) {
          // Fallback to direct kill if tree-kill fails
          try { child.kill('SIGKILL'); } catch { /* ignore */ }
        }
      });
    };
    
    const onAbort = () => {
      killTree();
      finish({ stdout, stderr: stderr + '\n[aborted]', code: -1 });
    };
    
    const timer = setTimeout(() => {
      killTree();
      finish({ stdout, stderr: stderr + '\n[timed out]', code: -1 });
    }, timeoutMs);
    
    signal?.addEventListener('abort', onAbort, { once: true });
    
    child.stdout?.on('data', (d) => { stdout += String(d); });
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', (e) => {
      finish({ stdout, stderr: stderr + '\n' + String(e), code: -1 });
    });
    child.on('close', (code) => {
      finish({ stdout, stderr, code: code ?? 0 });
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
  const fs = await import("node:fs");
  const pathMod = await import("node:path");
  const os = await import("node:os");
  const tmp = os.tmpdir();
  const csPath = pathMod.join(tmp, "CompanionCam.cs");
  const exePath = pathMod.join(tmp, "CompanionCam.exe");
  const code = [
    "using System;",
    "using System.Runtime.InteropServices.WindowsRuntime;",
    "using Windows.Media.Capture;",
    "using Windows.Media.MediaProperties;",
    "using Windows.Storage;",
    "public class CompanionCam {",
    "  public static void Main() {",
    "    var mc = new MediaCapture();",
    "    mc.InitializeAsync().AsTask().GetAwaiter().GetResult();",
    "    var props = ImageEncodingProperties.CreateJpeg();",
    "    var folder = KnownFolders.PicturesLibrary;",
    "    var file = folder.CreateFileAsync(\"companion-photo.jpg\", CreationCollisionOption.GenerateUniqueName).AsTask().GetAwaiter().GetResult();",
    "    mc.CapturePhotoToStorageFileAsync(props, file).AsTask().GetAwaiter().GetResult();",
    "    mc.Dispose();",
    "    Console.WriteLine(file.Path);",
    "  }",
    "}",
  ].join("\n");
  try {
    fs.writeFileSync(csPath, code, "utf8");
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  // compile
  const csc = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
  const winmd = "C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\10.0.26100.0\\Windows.winmd";
  const compile = await new Promise<{ code: number; stderr: string }>((resolve) => {
    const child = spawn(csc, [
      "/target:exe",
      `/out:${exePath}`,
      `/r:${winmd}`,
      "/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.dll",
      "/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.WindowsRuntime.dll",
      csPath,
    ], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("close", (code) => resolve({ code: code ?? -1, stderr: err }));
    child.on("error", (e) => resolve({ code: -1, stderr: String(e) }));
  });
  if (compile.code !== 0) {
    return { ok: false, error: compile.stderr.trim() || "compile_failed" };
  }
  // run
  return new Promise((resolve) => {
    const child = spawn(exePath, [], { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("close", (code) => {
      const p = out.trim();
      if (code === 0 && p) resolve({ ok: true, path: p });
      else resolve({ ok: false, error: err.trim() || `exit ${code}` });
    });
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}


export async function recordVideo(seconds: number = 5): Promise<{ ok: boolean; path?: string; error?: string }> {
  const fs = await import("node:fs");
  const pathMod = await import("node:path");
  const os = await import("node:os");
  const tmp = os.tmpdir();
  const csPath = pathMod.join(tmp, "CompanionVid.cs");
  const exePath = pathMod.join(tmp, "CompanionVid.exe");
  const code = [
    "using System;",
    "using System.Runtime.InteropServices.WindowsRuntime;",
    "using Windows.Media.Capture;",
    "using Windows.Media.MediaProperties;",
    "using Windows.Storage;",
    "public class CompanionVid {",
    "  public static void Main() {",
    "    var mc = new MediaCapture();",
    "    mc.InitializeAsync().AsTask().GetAwaiter().GetResult();",
    "    var profile = MediaEncodingProfile.CreateMp4(VideoEncodingQuality.Auto);",
    "    var folder = KnownFolders.VideosLibrary;",
    "    var file = folder.CreateFileAsync(\"companion-video.mp4\", CreationCollisionOption.GenerateUniqueName).AsTask().GetAwaiter().GetResult();",
    "    mc.StartRecordToStorageFileAsync(profile, file).AsTask().GetAwaiter().GetResult();",
    `    System.Threading.Thread.Sleep(${Math.max(1, seconds) * 1000});`,
    "    mc.StopRecordAsync().AsTask().GetAwaiter().GetResult();",
    "    mc.Dispose();",
    "    Console.WriteLine(file.Path);",
    "  }",
    "}",
  ].join("\n");
  try { fs.writeFileSync(csPath, code, "utf8"); } catch (e) { return { ok: false, error: String(e) }; }
  const csc = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
  const winmd = "C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\10.0.26100.0\\Windows.winmd";
  const compile = await new Promise<{ code: number; stderr: string }>((resolve) => {
    const child = spawn(csc, [
      "/target:exe",
      `/out:${exePath}`,
      `/r:${winmd}`,
      "/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.dll",
      "/r:C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.WindowsRuntime.dll",
      csPath,
    ], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("close", (code) => resolve({ code: code ?? -1, stderr: err }));
    child.on("error", (e) => resolve({ code: -1, stderr: String(e) }));
  });
  if (compile.code !== 0) return { ok: false, error: compile.stderr.trim() || "compile_failed" };
  return new Promise((resolve) => {
    const child = spawn(exePath, [], { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("close", (code) => {
      const p = out.trim();
      if (code === 0 && p) resolve({ ok: true, path: p });
      else resolve({ ok: false, error: err.trim() || `exit ${code}` });
    });
    child.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

function escapeSendKeys(s: string): string {
  return s.split('').map((c) => {
    if ('+^%~(){}[]'.includes(c)) return `{${c}}`;
    return c;
  }).join('');
}

export interface WhatsAppSendResult {
  typed: boolean;
  sent: boolean;
  verified: boolean;
  error?: string;
}

async function findProcessId(imageName: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'], { windowsHide: true }, (error, stdout) => {
      if (error) return resolve(null);
      const line = stdout.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean);
      if (!line) return resolve(null);
      const cols = line.split(',').map((col) => col.replace(/^"|"$/g, ''));
      const pid = Number(cols[1]);
      resolve(Number.isInteger(pid) && pid > 0 ? pid : null);
    });
  });
}

async function observeWhatsAppOutgoing(message: string): Promise<boolean> {
  const needle = message.trim().toLowerCase();
  if (!needle) return false;
  const pid = (await findProcessId('WhatsApp.exe'))
    ?? (await findProcessId('WhatsApp.Receiver.exe'))
    ?? (await findProcessId('ApplicationFrameHost.exe'));
  if (!pid) return false;
  try {
    const probe = await probeUiAutomation(pid, 10_000, 'WhatsApp');
    const haystacks = probe.controls.map((control) => `${control.name} ${control.automationId}`.toLowerCase());
    return haystacks.some((text) => text.includes(needle.slice(0, Math.min(needle.length, 80))));
  } catch {
    return false;
  }
}

export async function sendWhatsAppMessage(contact: string, message: string, signal?: AbortSignal): Promise<WhatsAppSendResult> {
  if (signal?.aborted) return { typed: false, sent: false, verified: false, error: 'aborted' };
  
  const phone = contact.replace(/[^\d+]/g, '');
  const isPhone = phone.length >= 7;
  const encoded = encodeURIComponent(message);
  const url = isPhone ? `https://wa.me/${phone}?text=${encoded}` : 'whatsapp://';
  const open = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const child = spawn('cmd', ['/c', 'start', '', url], { windowsHide: true });
    let err = '';
    const onAbort = () => {
      try { child.kill(); } catch { /* ignore */ }
      resolve({ ok: false, error: 'aborted' });
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      resolve(code === 0 ? { ok: true } : { ok: false, error: err.trim() || `exit ${code}` });
    });
    child.on('error', (e) => {
      signal?.removeEventListener('abort', onAbort);
      resolve({ ok: false, error: e.message });
    });
  });
  if (!open.ok) return { typed: false, sent: false, verified: false, error: open.error };
  if (signal?.aborted) return { typed: false, sent: false, verified: false, error: 'aborted' };
  
  await new Promise((r) => setTimeout(r, isPhone ? 4000 : 5000));
  if (signal?.aborted) return { typed: false, sent: false, verified: false, error: 'aborted' };
  
  const contactEsc = escapeSendKeys(contact);
  const messageEsc = escapeSendKeys(message);
  const steps: string[] = [];
  steps.push('$wsh = New-Object -ComObject WScript.Shell');
  steps.push('if (-not $wsh.AppActivate("WhatsApp")) { exit 1 }');
  steps.push('Start-Sleep -Milliseconds 800');
  if (!isPhone) {
    steps.push('$wsh.SendKeys("^f")');
    steps.push('Start-Sleep -Milliseconds 600');
    steps.push(`$wsh.SendKeys("${contactEsc}")`);
    steps.push('Start-Sleep -Milliseconds 1500');
    steps.push('$wsh.SendKeys("{ENTER}")');
    steps.push('Start-Sleep -Milliseconds 1200');
    steps.push(`$wsh.SendKeys("${messageEsc}")`);
    steps.push('Start-Sleep -Milliseconds 500');
  }
  steps.push('$wsh.SendKeys("{ENTER}")');
  const ps = steps.join('; ');
  const typed = await new Promise<boolean>((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true });
    const onAbort = () => {
      try { child.kill(); } catch { /* ignore */ }
      resolve(false);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('close', (c) => {
      signal?.removeEventListener('abort', onAbort);
      resolve(c === 0);
    });
    child.on('error', () => {
      signal?.removeEventListener('abort', onAbort);
      resolve(false);
    });
  });

  if (!typed) return { typed: false, sent: false, verified: false, error: signal?.aborted ? 'aborted' : 'ui_automation_failed' };
  if (signal?.aborted) return { typed: true, sent: false, verified: false, error: 'aborted' };

  // Keystrokes are not observation. Only an accessibility-tree read of the
  // outgoing bubble may set sent/verified.
  await new Promise((r) => setTimeout(r, 1200));
  if (signal?.aborted) return { typed: true, sent: false, verified: false, error: 'aborted' };
  
  const observed = await observeWhatsAppOutgoing(message);
  return observed
    ? { typed: true, sent: true, verified: true }
    : { typed: true, sent: false, verified: false, error: 'typed_but_unconfirmed' };
}
