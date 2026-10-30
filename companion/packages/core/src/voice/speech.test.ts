import { describe, expect, it } from 'vitest';
import {
  defaultVoiceSettings,
  isBargeIn,
  isNoiseTranscript,
  isQuietHours,
  normalizeVoiceSettings,
  parseVoiceEventLine,
  shouldSpeak,
  textSimilarity,
  toSpeakable,
  VoiceSessionTracker
} from './speech.js';

describe('normalizeVoiceSettings', () => {
  it('clamps ranges and rejects bad quiet hours', () => {
    const settings = normalizeVoiceSettings({
      rate: 100,
      pitch: -100,
      quietHours: { start: '25:00', end: '07:00' },
      engine: 'magic',
      proactiveDailyCap: 99
    });
    expect(settings.rate).toBe(10);
    expect(settings.pitch).toBe(-10);
    expect(settings.quietHours).toBeUndefined();
    expect(settings.engine).toBe('auto');
    expect(settings.proactiveDailyCap).toBe(12);
  });

  it('keeps valid quiet hours and defaults to speech-first', () => {
    const settings = normalizeVoiceSettings({ quietHours: { start: '22:30', end: '07:00' } });
    expect(settings.quietHours).toEqual({ start: '22:30', end: '07:00' });
    expect(settings.autoStart).toBe(true);
    expect(settings.handsFree).toBe(true);
    expect(settings.bargeIn).toBe(true);
    expect(defaultVoiceSettings.muted).toBe(false);
  });

  it('normalizes recent greetings so they cannot grow unbounded', () => {
    const settings = normalizeVoiceSettings({ recentGreetings: Array.from({ length: 20 }, (_, index) => `hello ${index}`) });
    expect(settings.recentGreetings).toHaveLength(10);
    expect(settings.recentGreetings?.[9]).toBe('hello 19');
  });
});

describe('quiet hours', () => {
  it('handles overnight and same-day windows', () => {
    const at = (hour: number, minute = 0) => new Date(2026, 9, 30, hour, minute);
    expect(isQuietHours(at(23), { start: '22:00', end: '07:00' })).toBe(true);
    expect(isQuietHours(at(6, 59), { start: '22:00', end: '07:00' })).toBe(true);
    expect(isQuietHours(at(7), { start: '22:00', end: '07:00' })).toBe(false);
    expect(isQuietHours(at(13), { start: '12:00', end: '14:00' })).toBe(true);
    expect(isQuietHours(at(14), { start: '12:00', end: '14:00' })).toBe(false);
    expect(isQuietHours(at(13), undefined)).toBe(false);
  });

  it('reports muted before quiet hours', () => {
    expect(shouldSpeak({ ...defaultVoiceSettings, muted: true, quietHours: { start: '00:00', end: '23:59' } })).toEqual({ ok: false, reason: 'muted' });
    expect(shouldSpeak({ ...defaultVoiceSettings, quietHours: { start: '00:00', end: '23:59' } })).toEqual({ ok: false, reason: 'quiet_hours' });
  });
});

describe('toSpeakable', () => {
  it('strips markdown and keeps three sentences', () => {
    const text = toSpeakable('**Done.** Here is `npm run build`. Then ship it.\n\n- extra detail\n- more detail');
    expect(text).toBe('Done. Here is npm run build. Then ship it.');
  });

  it('hides sensitive details behind an attention phrase', () => {
    const text = toSpeakable('The password is hunter2 and the bank account is 123456.', { speakSafe: true });
    expect(text).not.toContain('hunter2');
    expect(text).toContain('needs your attention');
  });

  it('handles empty output', () => {
    expect(toSpeakable('   ')).toBe('');
  });
});

describe('parseVoiceEventLine', () => {
  it('parses helper JSON events', () => {
    expect(parseVoiceEventLine('{"event":"ready","language":"en-US"}')).toEqual({ type: 'ready', engine: 'winrt', language: 'en-US' });
    expect(parseVoiceEventLine('{"event":"result","text":"open notepad","confidence":"0.91"}')).toEqual({ type: 'result', text: 'open notepad', confidence: '0.91' });
    expect(parseVoiceEventLine('{"event":"speech_done"}')).toEqual({ type: 'speech_done' });
  });

  it('parses PowerShell fallback markers', () => {
    expect(parseVoiceEventLine('READY', 'powershell')).toEqual({ type: 'ready', engine: 'powershell' });
    expect(parseVoiceEventLine('RECOGNIZED: what time is it', 'sapi')).toEqual({ type: 'result', text: ' what time is it' });
    expect(parseVoiceEventLine('SPEECH_STARTED', 'sapi')).toEqual({ type: 'speech_started' });
  });

  it('maps the Windows privacy failure to an actionable code', () => {
    const event = parseVoiceEventLine('{"event":"error","message":"The speech privacy policy was not accepted prior to attempting a speech recognition."}');
    expect(event).toMatchObject({ type: 'error', code: 'speech_privacy' });
  });

  it('ignores malformed lines', () => {
    expect(parseVoiceEventLine('not json')).toBeNull();
    expect(parseVoiceEventLine('{"event":')).toBeNull();
    expect(parseVoiceEventLine('{"event":"unknown"}')).toBeNull();
  });

  it('parses voice inventories', () => {
    const event = parseVoiceEventLine('{"event":"voices","synthesis":[{"name":"Microsoft David","language":"en-US","id":"x","gender":"Male"}],"recognition_languages":[{"tag":"en-US","name":"English"}]}');
    expect(event).toMatchObject({
      type: 'voices',
      synthesis: [{ name: 'Microsoft David', language: 'en-US', id: 'x', gender: 'Male' }],
      recognitionLanguages: [{ tag: 'en-US', name: 'English' }]
    });
  });
});

describe('noise rejection', () => {
  it('drops low-confidence room tone from SAPI', () => {
    expect(isNoiseTranscript('The', 0.002)).toBe(true);
    expect(isNoiseTranscript('uh', 0.9)).toBe(true);
    expect(isNoiseTranscript('open notepad', 0.72)).toBe(false);
  });

  it('keeps real speech with no confidence estimate', () => {
    expect(isNoiseTranscript('what time is it')).toBe(false);
    expect(isNoiseTranscript('')).toBe(true);
  });
});

describe('barge-in echo guard', () => {
  it('measures similarity', () => {
    expect(textSimilarity('I will open notepad for you', 'I will open notepad for you now')).toBeGreaterThan(0.7);
    expect(textSimilarity('stop', 'I will open notepad')).toBe(0);
  });

  it('rejects the companion hearing its own speech', () => {
    expect(isBargeIn('I will open notepad for you now', 'I will open notepad for you')).toBe(false);
  });

  it('accepts a short real interruption', () => {
    expect(isBargeIn('wait', 'Here is a long explanation about the installer build')).toBe(true);
    expect(isBargeIn('open notepad', 'Here is a long explanation about the installer build')).toBe(true);
  });

  it('ignores silence', () => {
    expect(isBargeIn('   ', 'anything')).toBe(false);
  });
});

describe('VoiceSessionTracker', () => {
  it('only reports listening after the engine is ready', () => {
    const tracker = new VoiceSessionTracker();
    expect(tracker.state).toBe('off');
    tracker.beginStart();
    expect(tracker.state).toBe('starting');
    tracker.markReady('sapi');
    expect(tracker.state).toBe('listening');
    expect(tracker.engine).toBe('sapi');
  });

  it('surfaces failure instead of pretending to listen', () => {
    const tracker = new VoiceSessionTracker();
    tracker.beginStart();
    tracker.apply({ type: 'error', message: 'privacy', code: 'speech_privacy' });
    expect(tracker.state).toBe('error');
    expect(tracker.failure).toBe('speech_privacy');
  });

  it('tracks speaking and returns to listening', () => {
    const tracker = new VoiceSessionTracker();
    tracker.markReady('winrt');
    tracker.apply({ type: 'speech_started' });
    expect(tracker.state).toBe('speaking');
    tracker.apply({ type: 'speech_done' });
    expect(tracker.state).toBe('listening');
  });

  it('stops cleanly', () => {
    const tracker = new VoiceSessionTracker();
    tracker.markReady('sapi');
    tracker.apply({ type: 'stopped' });
    expect(tracker.state).toBe('off');
  });
});
