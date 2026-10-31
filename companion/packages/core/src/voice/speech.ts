/**
 * Voice session contracts and pure state logic.
 *
 * The Electron main process owns the child processes; this module owns the
 * deterministic parts that must be testable without audio hardware:
 * settings normalization, quiet hours, event parsing, speak-safe shaping and
 * the listening/speaking state machine (including echo-aware barge-in).
 */

export type VoiceEngine = 'gemini' | 'winrt' | 'sapi' | 'powershell' | 'none';

export { SpeakerVerification } from './speaker-verification.js';
export type { SpeakerVerificationConfig, VerificationResult } from './speaker-verification.js';
export type VoiceState = 'off' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';
export type VoiceFailureCode =
  | 'speech_privacy'
  | 'microphone_privacy'
  | 'no_microphone'
  | 'no_recognizer'
  | 'engine_timeout'
  | 'engine_crashed'
  | 'not_installed'
  | 'interrupted'
  | 'unknown';

export interface QuietHours {
  start: string;
  end: string;
}

export interface VoiceSettings {
  voice: string;
  rate: number;
  pitch: number;
  language: string;
  muted: boolean;
  quietHours?: QuietHours;
  autoStart: boolean;
  handsFree: boolean;
  bargeIn: boolean;
  proactiveQuestions: boolean;
  proactiveDailyCap: number;
  proactiveIdleMinutes: number;
  pronunciation?: string;
  engine: 'auto' | 'winrt' | 'sapi';
  listenWhenUnfocused: boolean;
  cloudSpeechConsent: boolean;
  speakerVerificationEnabled?: boolean;
  recentGreetings?: string[];
}

export const defaultVoiceSettings: VoiceSettings = {
  voice: '',
  rate: 0,
  pitch: 0,
  language: 'en-US',
  muted: false,
  autoStart: true,
  handsFree: true,
  bargeIn: true,
  proactiveQuestions: true,
  proactiveDailyCap: 3,
  proactiveIdleMinutes: 8,
  engine: 'auto',
  listenWhenUnfocused: false,
  cloudSpeechConsent: false,
  recentGreetings: []
};

export interface VoiceVoiceInfo {
  name: string;
  language: string;
  id: string;
  gender?: string;
}

export interface VoiceLanguageInfo {
  tag: string;
  name: string;
}

export type VoiceEvent =
  | { type: 'ready'; engine: VoiceEngine; language?: string }
  | { type: 'hypothesis'; text: string }
  | { type: 'result'; text: string; confidence?: string }
  | { type: 'speech_detected' }
  | { type: 'speech_started'; voice?: string }
  | { type: 'speech_done' }
  | { type: 'fallback'; engine: VoiceEngine; message?: string }
  | { type: 'error'; message: string; code?: VoiceFailureCode }
  | { type: 'completed'; status?: string }
  | { type: 'stopped' }
  | { type: 'voices'; synthesis: VoiceVoiceInfo[]; recognitionLanguages: VoiceLanguageInfo[] }
  | { type: 'pong' };

export interface VoiceStartResult {
  started: boolean;
  engine: VoiceEngine;
  code?: VoiceFailureCode;
  message?: string;
  warning?: string;
  settingsUri?: string;
}

export interface VoiceSpeakResult {
  spoken: boolean;
  interrupted?: boolean;
  skipped?: 'muted' | 'quiet_hours' | 'empty';
  error?: string;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function cleanString(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function parseClock(value: unknown): string | undefined {
  const text = cleanString(value, 5);
  if (!/^\d{1,2}:\d{2}$/.test(text)) return undefined;
  const [hourText, minuteText] = text.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function normalizeVoiceSettings(raw: unknown): VoiceSettings {
  const record = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const quietRecord = record.quietHours !== null && typeof record.quietHours === 'object' ? record.quietHours as Record<string, unknown> : undefined;
  const start = quietRecord ? parseClock(quietRecord.start) : undefined;
  const end = quietRecord ? parseClock(quietRecord.end) : undefined;
  const recent = Array.isArray(record.recentGreetings)
    ? record.recentGreetings.map((item) => cleanString(item, 240)).filter(Boolean).slice(-10)
    : [];
  const engineValue = record.engine;
  const engine: VoiceSettings['engine'] = engineValue === 'winrt' || engineValue === 'sapi' ? engineValue : 'auto';
  return {
    voice: cleanString(record.voice, 120),
    rate: clampInteger(record.rate, -10, 10, defaultVoiceSettings.rate),
    pitch: clampInteger(record.pitch, -10, 10, defaultVoiceSettings.pitch),
    language: /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(cleanString(record.language, 20))
      ? cleanString(record.language, 20)
      : defaultVoiceSettings.language,
    muted: record.muted === true,
    quietHours: start && end ? { start, end } : undefined,
    autoStart: record.autoStart !== false,
    handsFree: record.handsFree !== false,
    bargeIn: record.bargeIn !== false,
    proactiveQuestions: record.proactiveQuestions !== false,
    proactiveDailyCap: clampInteger(record.proactiveDailyCap, 0, 12, defaultVoiceSettings.proactiveDailyCap),
    proactiveIdleMinutes: clampInteger(record.proactiveIdleMinutes, 1, 240, defaultVoiceSettings.proactiveIdleMinutes),
    pronunciation: cleanString(record.pronunciation, 120) || undefined,
    engine,
    listenWhenUnfocused: record.listenWhenUnfocused === true,
    cloudSpeechConsent: record.cloudSpeechConsent === true,
    speakerVerificationEnabled: record.speakerVerificationEnabled === true,
    recentGreetings: recent
  };
}

function clockMinutes(value: string): number {
  const [hour = 0, minute = 0] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function isQuietHours(now: Date, quietHours?: QuietHours): boolean {
  if (!quietHours) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = clockMinutes(quietHours.start);
  const end = clockMinutes(quietHours.end);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function voiceSilenceReason(settings: VoiceSettings, now: Date = new Date()): 'muted' | 'quiet_hours' | undefined {
  if (settings.muted) return 'muted';
  if (isQuietHours(now, settings.quietHours)) return 'quiet_hours';
  return undefined;
}

export function shouldSpeak(settings: VoiceSettings, now: Date = new Date()): { ok: boolean; reason?: 'muted' | 'quiet_hours' } {
  const reason = voiceSilenceReason(settings, now);
  return reason ? { ok: false, reason } : { ok: true };
}

const sensitivePattern = /\b(password|passcode|secret|api key|token|message content|private message|sender|bank account|card number|routing number|account number|amount of (?:money|money owed|the bill))\b/i;

export interface SpeakableRules {
  maxSentences?: number;
  maxCharacters?: number;
  speakSafe?: boolean;
}

/**
 * Convert model output into something a human can comfortably hear.
 * Markdown is stripped, newlines become sentence breaks, and private data is
 * replaced with a neutral attention phrase.
 */
export function toSpeakable(input: string, rules: SpeakableRules = {}): string {
  let text = String(input ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (rules.speakSafe && sensitivePattern.test(text)) {
    return 'I have an update that needs your attention. I have put the details in the text log.';
  }
  const maxSentences = rules.maxSentences ?? 3;
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  text = sentences.slice(0, maxSentences).join(' ');
  const maxCharacters = rules.maxCharacters ?? 900;
  if (text.length > maxCharacters) {
    const cut = text.slice(0, Math.max(0, maxCharacters - 1));
    const lastSpace = cut.lastIndexOf(' ');
    text = `${(lastSpace > maxCharacters * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }
  return text;
}

/** Split long digests into barge-in friendly sentence groups for WinRT TTS. */
export function chunkSpeakable(
  input: string,
  options?: { sentencesPerChunk?: number; maxChunks?: number; speakSafe?: boolean }
): string[] {
  const sentencesPerChunk = Math.max(1, options?.sentencesPerChunk ?? 2);
  const maxChunks = Math.max(1, options?.maxChunks ?? 12);
  const full = toSpeakable(input, {
    speakSafe: options?.speakSafe !== false,
    maxSentences: sentencesPerChunk * maxChunks,
    maxCharacters: 8_000,
  });
  if (!full) return [];
  const sentences = full.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [full];
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length && chunks.length < maxChunks; i += sentencesPerChunk) {
    chunks.push(sentences.slice(i, i + sentencesPerChunk).join(' '));
  }
  return chunks;
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function words(text: string): string[] {
  return normalizeForCompare(text).split(' ').filter((word) => word.length > 1);
}

const fillerWords = new Set([
  'a', 'an', 'the', 'uh', 'um', 'er', 'ah', 'hmm', 'mm', 'mhm', 'huh', 'hm',
  'noise', 'silence', 'inaudible', 'unintelligible', 'blank', 'empty', 'static'
]);

const noiseTagPattern = /^(?:<\s*noise\s*>|\(\s*noise\s*\)|\[\s*noise\s*\]|<\s*silence\s*>|\(\s*silence\s*\)|\[\s*silence\s*\])$/i;
const punctuationOnlyPattern = /^[\s./\\|,;:!?'"`~_\-…•·]+$/;

/**
 * Reject recognizer noise before it becomes a chat message. System.Speech in
 * particular emits very low-confidence single filler words from room tone.
 * Cloud STT may also emit tags like `<noise>` for ambient sound.
 */
export function isNoiseTranscript(text: string, confidence?: number, minimumConfidence = 0.2): boolean {
  const raw = String(text ?? '').trim();
  if (!raw) return true;
  if (punctuationOnlyPattern.test(raw)) return true;
  if (noiseTagPattern.test(raw)) return true;
  if (/^(?:noise|silence|inaudible|unintelligible|empty)$/i.test(raw)) return true;
  if (typeof confidence === 'number' && Number.isFinite(confidence) && confidence < minimumConfidence) return true;
  const normalized = normalizeForCompare(raw);
  if (!normalized) return true;
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.every((token) => fillerWords.has(token))) return true;
  // Single very short nonsense token that is not a real command word.
  if (tokens.length === 1 && tokens[0]!.length <= 2 && !/^(no|ok|go|hi|yo|up|on)$/i.test(tokens[0]!)) return true;
  return false;
}

/** Jaccard similarity over words, used to reject the companion hearing itself. */
export function textSimilarity(a: string, b: string): number {
  const left = new Set(words(a));
  const right = new Set(words(b));
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const word of left) if (right.has(word)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

/**
 * True when a recognizer hypothesis should interrupt current speech.
 * Rejects empty text and text that closely matches what is being spoken
 * (speaker echo), but allows short real interruptions such as "wait" or "stop".
 */
export function isBargeIn(hypothesis: string, spokenText: string, similarityThreshold = 0.55): boolean {
  const candidate = normalizeForCompare(hypothesis);
  if (!candidate) return false;
  const spoken = normalizeForCompare(spokenText);
  if (!spoken) return true;
  if (candidate.length <= 12 && /\b(stop|wait|hold on|pause|quiet|shush|no)\b/.test(candidate)) return true;
  return textSimilarity(candidate, spoken) < similarityThreshold;
}

const failureCodes: readonly VoiceFailureCode[] = [
  'speech_privacy', 'microphone_privacy', 'no_microphone', 'no_recognizer',
  'engine_timeout', 'engine_crashed', 'not_installed', 'interrupted', 'unknown'
];

function failureCode(value: unknown): VoiceFailureCode | undefined {
  return failureCodes.includes(value as VoiceFailureCode) ? (value as VoiceFailureCode) : undefined;
}

function jsonMessage(parsed: Record<string, unknown>): string {
  const direct = cleanString(parsed.message, 600);
  if (direct) return direct;
  const err = parsed.error;
  if (err !== null && typeof err === 'object') {
    return cleanString((err as Record<string, unknown>).message, 600);
  }
  return cleanString(err, 600);
}

/**
 * Parse one NDJSON line from the native voice helper or the PowerShell
 * fallback. Malformed lines are ignored rather than crashing the loop.
 */
export function parseVoiceEventLine(line: string, engine: VoiceEngine = 'winrt'): VoiceEvent | null {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;
  // PowerShell fallback markers.
  if (trimmed === 'READY') return { type: 'ready', engine };
  if (trimmed === 'STOPPING') return { type: 'stopped' };
  const recognized = /^RECOGNIZED:(.*)$/.exec(trimmed);
  if (recognized) return { type: 'result', text: recognized[1] ?? '' };
  if (trimmed.startsWith('SPEECH_STARTED')) return { type: 'speech_started' };
  if (trimmed.startsWith('SPEECH_DONE')) return { type: 'speech_done' };
  if (!trimmed.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const event = cleanString(record.event, 40);
  switch (event) {
    case 'ready':
      return { type: 'ready', engine, language: cleanString(record.language, 20) || undefined };
    case 'hypothesis':
      return { type: 'hypothesis', text: cleanString(record.text, 1200) };
    case 'result':
      return { type: 'result', text: cleanString(record.text, 1200), confidence: cleanString(record.confidence, 20) || undefined };
    case 'speech_detected':
      return { type: 'speech_detected' };
    case 'speech_started':
      return { type: 'speech_started', voice: cleanString(record.voice, 120) || undefined };
    case 'speech_done':
      return { type: 'speech_done' };
    case 'fallback':
      return { type: 'fallback', engine: record.engine === 'sapi' || record.engine === 'powershell' ? record.engine : 'sapi', message: cleanString(record.message, 300) || undefined };
    case 'error': {
      const message = jsonMessage(record);
      const privacy = /privacy/i.test(message);
      const mic = /microphone|audio device|input device/i.test(message);
      return {
        type: 'error',
        message: message || 'voice_engine_error',
        code: failureCode(record.code) ?? (privacy ? 'speech_privacy' : mic ? 'no_microphone' : undefined)
      };
    }
    case 'completed':
      return { type: 'completed', status: cleanString(record.status, 40) || undefined };
    case 'stopped':
      return { type: 'stopped' };
    case 'voices': {
      const synthesisRaw = Array.isArray(record.synthesis) ? record.synthesis : [];
      const languagesRaw = Array.isArray(record.recognition_languages) ? record.recognition_languages : [];
      const synthesis = synthesisRaw.map((item) => {
        const entry = item !== null && typeof item === 'object' ? item as Record<string, unknown> : {};
        return {
          name: cleanString(entry.name, 120),
          language: cleanString(entry.language, 20),
          id: cleanString(entry.id, 400),
          gender: cleanString(entry.gender, 20) || undefined
        };
      }).filter((item) => item.name);
      const recognitionLanguages = languagesRaw.map((item) => {
        const entry = item !== null && typeof item === 'object' ? item as Record<string, unknown> : {};
        return { tag: cleanString(entry.tag, 20), name: cleanString(entry.name, 80) };
      }).filter((item) => item.tag);
      return { type: 'voices', synthesis, recognitionLanguages };
    }
    case 'pong':
      return { type: 'pong' };
    default:
      return null;
  }
}

export interface StateTransitionContext {
  engine?: VoiceEngine;
  failure?: VoiceFailureCode;
  text?: string;
}

/**
 * Small deterministic state machine so the UI cannot show "Listening live"
 * when no recognizer is actually ready (the original production bug).
 */
export class VoiceSessionTracker {
  private currentState: VoiceState = 'off';
  private currentEngine: VoiceEngine = 'none';
  private lastFailure: VoiceFailureCode | undefined;

  get state(): VoiceState { return this.currentState; }
  get engine(): VoiceEngine { return this.currentEngine; }
  get failure(): VoiceFailureCode | undefined { return this.lastFailure; }

  beginStart(): VoiceState {
    this.currentState = 'starting';
    this.lastFailure = undefined;
    return this.currentState;
  }

  markReady(engine: VoiceEngine): VoiceState {
    this.currentEngine = engine;
    this.currentState = 'listening';
    this.lastFailure = undefined;
    return this.currentState;
  }

  markThinking(): VoiceState {
    if (this.currentState === 'off') return this.currentState;
    this.currentState = 'thinking';
    return this.currentState;
  }

  beginSpeaking(): VoiceState {
    this.currentState = 'speaking';
    return this.currentState;
  }

  markSpeakingDone(): VoiceState {
    this.currentState = this.currentState === 'off' ? 'off' : 'listening';
    return this.currentState;
  }

  pause(): VoiceState {
    this.currentState = 'paused';
    return this.currentState;
  }

  fail(code: VoiceFailureCode = 'unknown'): VoiceState {
    this.lastFailure = code;
    this.currentState = 'error';
    return this.currentState;
  }

  stop(): VoiceState {
    this.currentState = 'off';
    return this.currentState;
  }

  apply(event: VoiceEvent, context: StateTransitionContext = {}): VoiceState {
    switch (event.type) {
      case 'ready':
        return this.markReady(context.engine ?? this.currentEngine);
      case 'hypothesis':
      case 'result':
      case 'speech_detected':
        if (this.currentState === 'starting') this.currentState = 'listening';
        return this.currentState;
      case 'speech_started':
        return this.beginSpeaking();
      case 'speech_done':
        return this.markSpeakingDone();
      case 'error':
        return this.fail(context.failure ?? event.code ?? 'unknown');
      case 'completed':
      case 'stopped':
        this.currentState = 'off';
        return this.currentState;
      default:
        return this.currentState;
    }
  }
}
