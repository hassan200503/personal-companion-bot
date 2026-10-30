import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import {
  chunkSpeakable,
  isNoiseTranscript,
  normalizeVoiceSettings,
  parseVoiceEventLine,
  shouldSpeak,
  toSpeakable,
  VoiceSessionTracker,
  type VoiceEngine,
  type VoiceEvent,
  type VoiceFailureCode,
  type VoiceLanguageInfo,
  type VoiceSettings,
  type VoiceSpeakResult,
  type VoiceStartResult,
  type VoiceState,
  type VoiceVoiceInfo
} from '@companion/core';
import { stopSpeaking as stopLegacySpeaking } from '../../../../packages/core/src/os-control/windows.js';

export type VoiceServiceEvent =
  | { type: 'state'; state: VoiceState; engine: VoiceEngine; error?: string; code?: VoiceFailureCode }
  | { type: 'transcript'; text: string; final: boolean; engine: VoiceEngine; confidence?: number }
  | { type: 'speech'; state: 'started' | 'done'; engine?: VoiceEngine; voice?: string }
  | { type: 'voices'; synthesis: VoiceVoiceInfo[]; recognitionLanguages: VoiceLanguageInfo[] };

export interface VoiceServiceOptions {
  helperPath?: string;
  tempDir: string;
  language?: string;
  onEvent?: (event: VoiceServiceEvent) => void;
}

interface ListenerHandle {
  process: ChildProcess;
  engine: VoiceEngine;
  stopping: boolean;
}

function withLineTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function killQuietly(process: ChildProcess | null): void {
  if (!process) return;
  try { process.kill(); } catch { /* already gone */ }
}

export class VoiceService {
  private readonly helperPath: string;
  private readonly tempDir: string;
  private readonly language: string;
  private readonly onEvent?: (event: VoiceServiceEvent) => void;
  private readonly tracker = new VoiceSessionTracker();
  private listener: ListenerHandle | null = null;
  private startPromise: Promise<VoiceStartResult> | null = null;
  private speakingProcess: ChildProcess | null = null;
  private lastError: string | undefined;

  constructor(options: VoiceServiceOptions) {
    this.helperPath = options.helperPath ?? '';
    this.tempDir = options.tempDir;
    this.language = options.language ?? 'en-US';
    this.onEvent = options.onEvent;
  }

  get hasHelper(): boolean {
    return Boolean(this.helperPath) && existsSync(this.helperPath);
  }

  get state(): VoiceState {
    return this.tracker.state;
  }

  get engine(): VoiceEngine {
    return this.tracker.engine;
  }

  async listVoices(): Promise<{ synthesis: VoiceVoiceInfo[]; recognitionLanguages: VoiceLanguageInfo[] }> {
    if (this.hasHelper) {
      try {
        const events = await this.collect(this.helperPath, ['voices'], 15_000);
        const voices = events.find((event) => event.type === 'voices');
        if (voices && voices.type === 'voices') {
          return { synthesis: voices.synthesis, recognitionLanguages: voices.recognitionLanguages };
        }
      } catch { /* fall through to PowerShell */ }
    }
    return this.listVoicesPowerShell();
  }

  async start(settingsInput: unknown): Promise<VoiceStartResult> {
    const settings = normalizeVoiceSettings(settingsInput);
    if (settings.muted) {
      return { started: false, engine: 'none', code: 'interrupted', message: 'Voice is muted.' };
    }
    if (this.listener && !this.listener.stopping) {
      return { started: true, engine: this.listener.engine };
    }
    if (this.startPromise) return this.startPromise;
    this.tracker.beginStart();
    this.emitState('starting');
    this.startPromise = this.startInternal(settings).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startInternal(settings: VoiceSettings): Promise<VoiceStartResult> {
    const preferred = settings.engine === 'sapi' ? 'sapi' : 'winrt';
    const first = await this.startEngine(preferred, settings);
    if (first.started) return first;
    if (settings.engine === 'auto' && preferred === 'winrt' && first.code !== 'no_microphone') {
      const fallback = await this.startEngine('sapi', settings, first.message);
      if (fallback.started) {
        return {
          ...fallback,
          warning: 'Windows speech recognition privacy is not enabled, so I am using the older offline recognizer. Enable Settings > Privacy & security > Speech for much better accuracy.',
          settingsUri: 'ms-settings:privacy-speech'
        };
      }
      return fallback;
    }
    return first;
  }

  private async startEngine(engine: 'winrt' | 'sapi', settings: VoiceSettings, previousError?: string): Promise<VoiceStartResult> {
    if (this.hasHelper) {
      const args = engine === 'winrt' ? ['listen', settings.language || this.language] : ['listen-sapi', settings.language || this.language];
      const result = await this.startProcessEngine(engine, args);
      if (result.started || result.code !== 'not_installed') return result;
    }
    if (engine === 'sapi') return this.startPowerShell(previousError);
    return { started: false, engine: 'none', code: 'not_installed', message: 'No Windows speech engine is available.' };
  }

  private startProcessEngine(engine: 'winrt' | 'sapi', args: string[]): Promise<VoiceStartResult> {
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn(this.helperPath, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) {
        resolve({ started: false, engine: 'none', code: 'not_installed', message: String(error) });
        return;
      }
      const handle: ListenerHandle = { process: child, engine, stopping: false };
      let settled = false;
      let stderr = '';
      const finish = (result: VoiceStartResult) => {
        if (settled) return;
        settled = true;
        if (readyTimer) clearTimeout(readyTimer);
        if (!result.started) {
          handle.stopping = true;
          killQuietly(child);
        }
        resolve(result);
      };
      const readyTimer = setTimeout(() => {
        finish({ started: false, engine: 'none', code: 'engine_timeout', message: stderr.trim() || 'The listening engine did not become ready in time.' });
      }, 12_000);
      readyTimer.unref();
      const reader = createInterface({ input: child.stdout! });
      reader.on('line', (line) => {
        if (engine === 'sapi' && line.startsWith('SAPI-ERROR:')) {
          this.failEngine(line.slice(11).trim());
          finish({ started: false, engine: 'none', code: 'unknown', message: line.slice(11).trim() });
          return;
        }
        const event = parseVoiceEventLine(line, engine);
        if (!event) return;
        if (event.type === 'ready') {
          if (settled) return;
          settled = true;
          if (readyTimer) clearTimeout(readyTimer);
          this.listener = handle;
          this.tracker.markReady(engine);
          this.emitState('listening');
          resolve({ started: true, engine, message: 'Listening.' });
          return;
        }
        if (event.type === 'error') {
          this.lastError = event.message;
          const code = event.code ?? 'unknown';
          finish({ started: false, engine: 'none', code, message: event.message });
          return;
        }
        this.handleEvent(event, engine);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-2000);
      });
      child.on('error', (error) => {
        finish({ started: false, engine: 'none', code: 'not_installed', message: `${error.message}${stderr ? `: ${stderr.trim()}` : ''}` });
      });
      child.on('exit', (code) => {
        if (!settled) {
          finish({ started: false, engine: 'none', code: 'engine_crashed', message: stderr.trim() || `Voice helper exited with code ${code ?? 'unknown'}.` });
          return;
        }
        if (this.listener === handle) {
          this.listener = null;
          if (!handle.stopping) {
            this.tracker.fail('engine_crashed');
            this.emitState('error', stderr.trim() || 'The listening engine stopped unexpectedly.', 'engine_crashed');
          }
        }
      });
    });
  }

  async stop(): Promise<{ stopped: boolean }> {
    if (this.startPromise) {
      try { await this.startPromise; } catch { /* ignore */ }
    }
    const listener = this.listener;
    this.listener = null;
    if (!listener) {
      this.tracker.stop();
      this.emitState('off');
      return { stopped: false };
    }
    listener.stopping = true;
    try { listener.process.stdin?.write('stop\n'); } catch { /* ignore */ }
    setTimeout(() => killQuietly(listener.process), 750).unref();
    this.tracker.stop();
    this.emitState('off');
    return { stopped: true };
  }

  async speak(text: string, settingsInput: unknown): Promise<VoiceSpeakResult> {
    const settings = normalizeVoiceSettings(settingsInput);
    const gate = shouldSpeak(settings);
    if (!gate.ok) return { spoken: false, skipped: gate.reason };
    const safe = toSpeakable(text, { speakSafe: true, maxSentences: 3 });
    if (!safe) return { spoken: false, skipped: 'empty' };
    return this.speakRaw(safe, settings);
  }

  /**
   * Chunked WinRT read-aloud for research/email digests.
   * Stops between chunks so barge-in (stopSpeaking) can interrupt cleanly.
   */
  async speakChunks(text: string, settingsInput: unknown): Promise<VoiceSpeakResult> {
    const settings = normalizeVoiceSettings(settingsInput);
    const gate = shouldSpeak(settings);
    if (!gate.ok) return { spoken: false, skipped: gate.reason };
    const chunks = chunkSpeakable(text, { sentencesPerChunk: 2, maxChunks: 10 });
    if (chunks.length === 0) return { spoken: false, skipped: 'empty' };
    let last: VoiceSpeakResult = { spoken: false };
    for (const chunk of chunks) {
      if (this.speakingProcess === null && last.spoken === false && last.interrupted) {
        return { spoken: false, interrupted: true };
      }
      last = await this.speakRaw(chunk, settings);
      if (!last.spoken || last.interrupted) return last;
    }
    return last;
  }

  private async speakRaw(safe: string, settings: VoiceSettings): Promise<VoiceSpeakResult> {
    this.stopSpeaking(false);
    this.tracker.beginSpeaking();
    this.emitState('speaking');
    let result: VoiceSpeakResult;
    if (this.hasHelper) {
      result = await this.speakWithHelper(safe, settings);
      if (!result.spoken && !result.interrupted) {
        result = await this.speakPowerShell(safe, settings);
      }
    } else {
      result = await this.speakPowerShell(safe, settings);
    }
    this.tracker.markSpeakingDone();
    this.emitState(this.listener && !this.listener.stopping ? 'listening' : 'off');
    return result;
  }

  private speakWithHelper(text: string, settings: VoiceSettings): Promise<VoiceSpeakResult> {
    return new Promise((resolve) => {
      const encoded = Buffer.from(text, 'utf8').toString('base64');
      const args = ['speak', encoded, settings.voice || '', String(settings.rate), String(settings.pitch), settings.engine];
      let child: ChildProcess;
      try {
        child = spawn(this.helperPath, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) {
        resolve({ spoken: false, error: String(error) });
        return;
      }
      this.speakingProcess = child;
      let settled = false;
      let stderr = '';
      let wasInterrupted = false;
      const finish = (result: VoiceSpeakResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.speakingProcess === child) this.speakingProcess = null;
        resolve(result);
      };
      const words = text.split(/\s+/).length;
      const timer = setTimeout(() => {
        killQuietly(child);
        finish({ spoken: false, error: 'Timed out while speaking.' });
      }, Math.max(15_000, Math.min(120_000, words * 700 + 10_000)));
      timer.unref();
      const reader = createInterface({ input: child.stdout! });
      reader.on('line', (line) => {
        const event = parseVoiceEventLine(line, settings.engine === 'sapi' ? 'sapi' : 'winrt');
        if (!event) return;
        if (event.type === 'speech_started') {
          this.onEvent?.({ type: 'speech', state: 'started', engine: settings.engine === 'sapi' ? 'sapi' : 'winrt', voice: event.voice });
        } else if (event.type === 'speech_done') {
          this.onEvent?.({ type: 'speech', state: 'done' });
          finish({ spoken: true, interrupted: false });
        } else if (event.type === 'fallback') {
          // The helper already switched to System.Speech; keep going.
        } else if (event.type === 'error') {
          finish({ spoken: false, error: event.message });
        }
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-2000);
      });
      child.on('error', (error) => finish({ spoken: false, error: error.message }));
      child.on('exit', (code, signal) => {
        if (settled) return;
        // stopSpeaking kills the child → treat as barge-in interrupt
        if (wasInterrupted || this.speakingProcess !== child) {
          finish({ spoken: false, interrupted: true });
          return;
        }
        if (code === null || code === 0 || signal === 'SIGTERM') {
          // SIGTERM without our interrupt flag still means external stop
          if (signal) {
            finish({ spoken: false, interrupted: true });
            return;
          }
          finish({ spoken: true, interrupted: false });
        } else {
          finish({ spoken: false, interrupted: false, error: stderr.trim() || `Speech helper exited with code ${code}.` });
        }
      });
      // Expose interrupt marker via weak map on process for stopSpeaking
      (child as ChildProcess & { __companionInterrupted?: () => void }).__companionInterrupted = () => {
        wasInterrupted = true;
      };
    });
  }

  stopSpeaking(emit = true): { stopped: boolean } {
    const child = this.speakingProcess;
    this.speakingProcess = null;
    stopLegacySpeaking();
    if (child) {
      const marked = child as ChildProcess & { __companionInterrupted?: () => void };
      marked.__companionInterrupted?.();
    }
    if (emit) {
      this.tracker.markSpeakingDone();
      this.emitState(this.listener && !this.listener.stopping ? 'listening' : 'off', 'Speech interrupted.', 'interrupted');
    }
    if (!child) return { stopped: false };
    killQuietly(child);
    return { stopped: true };
  }

  dispose(): void {
    this.stopSpeaking(false);
    if (this.listener) this.listener.stopping = true;
    killQuietly(this.listener?.process ?? null);
    this.listener = null;
    this.tracker.stop();
  }

  private handleEvent(event: VoiceEvent, engine: VoiceEngine): void {
    if (event.type === 'hypothesis') {
      if (event.text && !isNoiseTranscript(event.text)) {
        this.onEvent?.({ type: 'transcript', text: event.text, final: false, engine });
      }
      return;
    }
    if (event.type === 'result' && event.text) {
      const confidence = event.confidence === undefined ? undefined : Number(event.confidence);
      if (isNoiseTranscript(event.text, confidence)) return;
      this.onEvent?.({ type: 'transcript', text: event.text, final: true, engine, confidence: Number.isFinite(confidence) ? confidence : undefined });
      return;
    }
    if (event.type === 'error') {
      this.lastError = event.message;
      const code = event.code ?? 'unknown';
      this.tracker.fail(code);
      this.emitState('error', event.message, code);
    }
  }

  private emitState(state: VoiceState, error?: string, code?: VoiceFailureCode): void {
    this.onEvent?.({
      type: 'state',
      state,
      engine: this.listener?.engine ?? this.tracker.engine,
      error: error ?? (state === 'error' ? this.lastError : undefined),
      code
    });
  }

  private failEngine(message: string): void {
    this.lastError = message;
    this.tracker.fail('unknown');
    this.emitState('error', message, 'unknown');
  }

  private async startPowerShell(previousError?: string): Promise<VoiceStartResult> {
    const scriptPath = join(this.tempDir, `companion-listen-${process.pid}.ps1`);
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$ErrorActionPreference = "Stop"',
      'try {',
      '  $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine',
      '  $r.SetInputToDefaultAudioDevice()',
      '  $r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))',
      '} catch {',
      '  [Console]::Out.WriteLine("ERROR:" + $_.Exception.Message)',
      '  [Console]::Out.Flush()',
      '  exit 1',
      '}',
      '[Console]::Out.WriteLine("READY")',
      '[Console]::Out.Flush()',
      'while ($true) {',
      '  try {',
      '    $res = $r.Recognize([TimeSpan]::FromSeconds(5))',
      '    if ($res -ne $null -and $res.Text) {',
      '      [Console]::Out.WriteLine("RECOGNIZED:" + $res.Text)',
      '      [Console]::Out.Flush()',
      '    }',
      '  } catch {',
      '    [Console]::Out.WriteLine("ERROR:" + $_.Exception.Message)',
      '    [Console]::Out.Flush()',
      '    break',
      '  }',
      '}',
    ].join('\n');
    try { writeFileSync(scriptPath, script, 'utf8'); } catch (error) {
      return { started: false, engine: 'none', code: 'unknown', message: String(error) };
    }
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) {
        resolve({ started: false, engine: 'none', code: 'not_installed', message: String(error) });
        return;
      }
      const handle: ListenerHandle = { process: child, engine: 'powershell', stopping: false };
      let settled = false;
      let stderr = '';
      const finish = (result: VoiceStartResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!result.started) {
          handle.stopping = true;
          killQuietly(child);
        }
        resolve(result);
      };
      const reader = createInterface({ input: child.stdout! });
      reader.on('line', (line) => {
        const trimmed = line.trim();
        if (trimmed === 'READY') {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.listener = handle;
          this.tracker.markReady('powershell');
          this.emitState('listening');
          resolve({
            started: true,
            engine: 'powershell',
            message: previousError ? `Live listening is using the fallback engine. ${previousError}` : 'Listening.'
          });
          return;
        }
        if (trimmed.startsWith('ERROR:')) {
          const message = trimmed.slice(6).trim();
          this.lastError = message;
          const privacy = /privacy/i.test(message);
          finish({ started: false, engine: 'none', code: privacy ? 'speech_privacy' : 'no_microphone', message });
          return;
        }
        const event = parseVoiceEventLine(trimmed, 'powershell');
        if (event) this.handleEvent(event, 'powershell');
      });
      child.stderr?.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-2000); });
      child.on('error', (error) => finish({ started: false, engine: 'none', code: 'not_installed', message: error.message }));
      child.on('exit', (code) => {
        if (!settled) {
          finish({ started: false, engine: 'none', code: 'engine_crashed', message: stderr.trim() || `Recognizer exited with code ${code ?? 'unknown'}.` });
          return;
        }
        if (this.listener === handle) {
          this.listener = null;
          if (!handle.stopping) {
            this.tracker.fail('engine_crashed');
            this.emitState('error', stderr.trim() || 'The recognizer stopped unexpectedly.', 'engine_crashed');
          }
        }
      });
      const timer = setTimeout(() => {
        finish({ started: false, engine: 'none', code: 'engine_timeout', message: 'The fallback recognizer did not become ready in time.' });
      }, 12_000);
    });
  }

  private speakPowerShell(text: string, settings: VoiceSettings): Promise<VoiceSpeakResult> {
    return new Promise((resolve) => {
      const encoded = Buffer.from(text, 'utf8').toString('base64');
      const voice = settings.voice ? `try { $s.SelectVoice('${settings.voice.replace(/'/g, "''")}') } catch {};` : '';
      const script = [
        `$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))`,
        'Add-Type -AssemblyName System.Speech',
        '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
        `$s.Rate = ${settings.rate};`,
        voice,
        '[Console]::Out.WriteLine("SPEECH_STARTED")',
        '[Console]::Out.Flush()',
        '$s.Speak($text)',
        '[Console]::Out.WriteLine("SPEECH_DONE")',
        '[Console]::Out.Flush()',
        '$s.Dispose()',
      ].filter(Boolean).join('\n');
      const scriptPath = join(this.tempDir, `companion-speak-${process.pid}-${Date.now()}.ps1`);
      try { writeFileSync(scriptPath, script, 'utf8'); } catch (error) {
        resolve({ spoken: false, error: String(error) });
        return;
      }
      let child: ChildProcess;
      try {
        child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        resolve({ spoken: false, error: String(error) });
        return;
      }
      this.speakingProcess = child;
      let settled = false;
      let stderr = '';
      const finish = (result: VoiceSpeakResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.speakingProcess === child) this.speakingProcess = null;
        resolve(result);
      };
      const timer = setTimeout(() => {
        killQuietly(child);
        finish({ spoken: false, error: 'Timed out while speaking.' });
      }, Math.max(15_000, Math.min(120_000, text.split(/\s+/).length * 700 + 10_000)));
      timer.unref();
      const reader = createInterface({ input: child.stdout! });
      reader.on('line', (line) => {
        if (line.trim() === 'SPEECH_STARTED') {
          this.onEvent?.({ type: 'speech', state: 'started', engine: 'powershell' });
        } else if (line.trim() === 'SPEECH_DONE') {
          this.onEvent?.({ type: 'speech', state: 'done' });
          finish({ spoken: true });
        }
      });
      child.stderr?.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-2000); });
      child.on('error', (error) => finish({ spoken: false, error: error.message }));
      child.on('exit', (code) => {
        if (settled) return;
        if (code === 0) finish({ spoken: true });
        else finish({ spoken: false, error: stderr.trim() || `Speech exited with code ${code ?? 'unknown'}.` });
      });
    });
  }

  private collect(helperPath: string, args: string[], timeoutMs: number): Promise<VoiceEvent[]> {
    return withLineTimeout(new Promise<VoiceEvent[]>((resolve) => {
      const child = spawn(helperPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const events: VoiceEvent[] = [];
      const reader = createInterface({ input: child.stdout! });
      reader.on('line', (line) => {
        const event = parseVoiceEventLine(line, 'winrt');
        if (event) events.push(event);
      });
      child.on('close', () => resolve(events));
      child.on('error', () => resolve(events));
    }), timeoutMs, 'voice_helper_timeout');
  }

  private async listVoicesPowerShell(): Promise<{ synthesis: VoiceVoiceInfo[]; recognitionLanguages: VoiceLanguageInfo[] }> {
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      '$items = @()',
      'foreach ($v in $s.GetInstalledVoices()) {',
      '  if ($v.Enabled) {',
      '    $items += [pscustomobject]@{ name = $v.VoiceInfo.Name; language = $v.VoiceInfo.Culture.Name; id = $v.VoiceInfo.Name; gender = $v.VoiceInfo.Gender.ToString() }',
      '  }',
      '}',
      '$s.Dispose()',
      '$items | ConvertTo-Json -Compress',
    ].join('\n');
    return new Promise((resolve) => {
      let child: ChildProcess;
      try {
        child = spawn('powershell', ['-NoProfile', '-Command', script], { windowsHide: true });
      } catch {
        resolve({ synthesis: [], recognitionLanguages: [] });
        return;
      }
      let out = '';
      child.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString(); });
      child.on('close', () => {
        try {
          const parsed = JSON.parse(out.trim() || '[]');
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          resolve({
            synthesis: rows.map((row: Record<string, unknown>) => ({
              name: String(row.name ?? ''),
              language: String(row.language ?? ''),
              id: String(row.id ?? ''),
              gender: String(row.gender ?? '') || undefined
            })).filter((voice: VoiceVoiceInfo) => voice.name),
            recognitionLanguages: []
          });
        } catch {
          resolve({ synthesis: [], recognitionLanguages: [] });
        }
      });
      child.on('error', () => resolve({ synthesis: [], recognitionLanguages: [] }));
    });
  }
}
