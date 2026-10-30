/* global console, process */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(appRoot, 'src', 'voice', 'CompanionVoice.cs');
const outputDir = join(appRoot, 'resources', 'voice');
const output = join(outputDir, 'CompanionVoice.exe');
const framework = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319';
const csc = join(framework, 'csc.exe');

function findWinmd() {
  const root = 'C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata';
  if (!existsSync(root)) return undefined;
  const versions = readdirSync(root)
    .filter((name) => /^\d+\.\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .reverse();
  for (const version of versions) {
    const candidate = join(root, version, 'Windows.winmd');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function findSystemSpeech() {
  const root = 'C:\\Windows\\Microsoft.NET\\assembly\\GAC_MSIL\\System.Speech';
  if (!existsSync(root)) return undefined;
  for (const version of readdirSync(root)) {
    const candidate = join(root, version, 'System.Speech.dll');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const winmd = findWinmd();
const systemSpeech = findSystemSpeech();
const windowsRuntime = join(framework, 'System.Runtime.WindowsRuntime.dll');
const interopRuntime = join(framework, 'System.Runtime.InteropServices.WindowsRuntime.dll');
const systemRuntime = join(framework, 'System.Runtime.dll');

if (!existsSync(csc) || !winmd || !systemSpeech || !existsSync(windowsRuntime) || !existsSync(interopRuntime) || !existsSync(systemRuntime)) {
  console.warn('[voice] C# helper skipped (Windows SDK or .NET Framework speech assemblies not found).');
  console.warn('[voice] The app will fall back to PowerShell System.Speech at runtime.');
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });
const args = [
  '/nologo',
  '/target:exe',
  '/platform:anycpu',
  '/optimize+',
  `/out:${output}`,
  `/r:${winmd}`,
  `/r:${systemSpeech}`,
  `/r:${windowsRuntime}`,
  `/r:${interopRuntime}`,
  `/r:${systemRuntime}`,
  source
];
try {
  execFileSync(csc, args, { stdio: 'inherit' });
  const bytes = statSync(output).size;
  console.log(`[voice] compiled CompanionVoice.exe (${bytes} bytes)`);
} catch (error) {
  console.warn(`[voice] helper compilation failed: ${String(error)}`);
  console.warn('[voice] runtime will fall back to PowerShell System.Speech.');
  process.exit(0);
}
