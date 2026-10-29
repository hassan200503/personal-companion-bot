import { openTarget, speakText } from '../companion/packages/core/src/os-control/windows.js';
import { execFileSync } from 'node:child_process';

function calculatorPids(): number[] {
  const output = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq CalculatorApp.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return [...output.matchAll(/"CalculatorApp\.exe","(\d+)"/gi)].map((match) => Number(match[1]));
}

const before = new Set(calculatorPids());

const speech = await speakText('Companion speech smoke test.');
const calculator = await openTarget('calculator');
const started = calculatorPids().filter((pid) => !before.has(pid));
for (const pid of started) {
  execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
}
console.log(JSON.stringify({ speech, calculator }));
