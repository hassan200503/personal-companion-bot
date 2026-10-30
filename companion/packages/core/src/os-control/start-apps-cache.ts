/**
 * Cached Start-menu / shortcut resolver so os.open does not block on a cold
 * Get-StartApps PowerShell call inside the tool timeout race.
 */

import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface StartAppEntry {
  name: string;
  appId: string;
  kind: 'start' | 'shortcut' | 'steam' | 'epic';
}

let cache: StartAppEntry[] = [];
let cacheAt = 0;
let refreshPromise: Promise<StartAppEntry[]> | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export function getCachedStartApps(): readonly StartAppEntry[] {
  return cache;
}

export function invalidateStartAppsCache(): void {
  cache = [];
  cacheAt = 0;
}

export async function ensureStartAppsCache(force = false): Promise<readonly StartAppEntry[]> {
  if (!force && cache.length > 0 && Date.now() - cacheAt < CACHE_TTL_MS) return cache;
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshStartAppsCache().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export function resolveFromStartAppsCache(query: string): StartAppEntry | undefined {
  const terms = tokens(query);
  if (terms.length === 0 || cache.length === 0) return undefined;
  let best: { entry: StartAppEntry; score: number } | undefined;
  for (const entry of cache) {
    const nameTokens = tokens(entry.name);
    const matched = terms.filter((term) => nameTokens.some((token) => token.includes(term) || term.includes(token))).length;
    if (matched === 0) continue;
    const exact = nameTokens.join(' ') === terms.join(' ');
    const score = matched / terms.length + (exact ? 0.5 : 0) + (entry.kind === 'steam' || entry.kind === 'epic' ? 0.05 : 0);
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= 0.45 ? best.entry : undefined;
}

async function refreshStartAppsCache(): Promise<StartAppEntry[]> {
  const entries: StartAppEntry[] = [];
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-StartApps | ForEach-Object { $_.Name + '`t' + $_.AppID }"
      ],
      { windowsHide: true, timeout: 45_000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' }
    );
    for (const line of stdout.split(/\r?\n/)) {
      const [name, appId] = line.split('\t');
      if (name?.trim() && appId?.trim()) {
        entries.push({ name: name.trim(), appId: appId.trim(), kind: 'start' });
      }
    }
  } catch {
    /* keep prior cache on failure */
  }

  for (const shortcut of scanShortcutRoots()) {
    entries.push(shortcut);
  }

  if (entries.length > 0) {
    cache = entries;
    cacheAt = Date.now();
  }
  return cache;
}

function scanShortcutRoots(): StartAppEntry[] {
  const roots = [
    process.env.APPDATA ? join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
    process.env.ProgramData ? join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
    process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Desktop') : '',
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'Steam', 'steamapps', 'common') : '',
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'Epic Games') : '',
  ].filter(Boolean);

  const found: StartAppEntry[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    walk(root, 3, (full, name) => {
      if (/\.lnk$/i.test(name)) {
        found.push({ name: basename(name, '.lnk'), appId: full, kind: 'shortcut' });
      } else if (/steamapps[\\/]common/i.test(full) && !name.includes('.')) {
        found.push({ name, appId: full, kind: 'steam' });
      } else if (/Epic Games/i.test(full) && !name.includes('.')) {
        found.push({ name, appId: full, kind: 'epic' });
      }
    });
  }
  return found;
}

function walk(dir: string, depth: number, visit: (full: string, name: string) => void): void {
  if (depth < 0) return;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      visit(full, entry.name);
      if (entry.isDirectory()) walk(full, depth - 1, visit);
    }
  } catch {
    /* ignore inaccessible dirs */
  }
}

function tokens(value: string): string[] {
  return value.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1);
}
