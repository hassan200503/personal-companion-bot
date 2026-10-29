import { describe, expect, it } from 'vitest';
import {
  defaultDenylistPolicy,
  EmergencyStop,
  isSensitiveTarget,
  TrustedIntentGuard,
  type EnvironmentSnapshot
} from '../security/index.js';

const unlocked: EnvironmentSnapshot = { screenLocked: false, secureDesktop: false };
const guard = new TrustedIntentGuard();

describe('TrustedIntentGuard', () => {
  it('allows class 1 owner actions when unlocked', () => {
    const decision = guard.authorize({ source: 'owner_ui', riskClass: 1, environment: unlocked });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(false);
  });

  it('denies all action classes when the screen is locked', () => {
    for (const riskClass of [1, 2, 3] as const) {
      const decision = guard.authorize({
        source: 'owner_ui',
        riskClass,
        environment: { screenLocked: true, secureDesktop: false }
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('screen_locked');
    }
  });

  it('denies actions on the secure desktop', () => {
    const decision = guard.authorize({
      source: 'owner_ui',
      riskClass: 2,
      environment: { screenLocked: false, secureDesktop: true }
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('secure_desktop');
  });

  it('denies untrusted content even for class 1', () => {
    const decision = guard.authorize({
      source: 'untrusted_content',
      riskClass: 1,
      environment: unlocked
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('untrusted_content_cannot_grant_intent');
  });

  it('denies system-sourced actions', () => {
    const decision = guard.authorize({ source: 'system', riskClass: 1, environment: unlocked });
    expect(decision.allowed).toBe(false);
  });

  it('denies class 4', () => {
    const decision = guard.authorize({ source: 'owner_ui', riskClass: 4, environment: unlocked });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('class_4_restricted');
  });

  it('requires confirmation for every class 3 action', () => {
    const decision = guard.authorize({ source: 'owner_ui', riskClass: 3, environment: unlocked });
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.explicitYesRequired).toBe(false);
  });

  it('requires an explicit yes for a first-time recipient, money or unusual content', () => {
    for (const extra of [
      { firstTimeRecipient: true },
      { ambiguousRecipient: true },
      { hasAttachment: true },
      { hasUnknownLink: true },
      { involvesMoney: true },
      { contentLength: 301 }
    ]) {
      const decision = guard.authorize({
        source: 'owner_ui',
        riskClass: 3,
        environment: unlocked,
        ...extra
      });
      expect(decision.requiresConfirmation).toBe(true);
      expect(decision.explicitYesRequired).toBe(true);
    }
  });

  it('requires a read-back for voice class 2 actions', () => {
    const decision = guard.authorize({
      source: 'owner_voice',
      riskClass: 2,
      environment: unlocked
    });
    expect(decision.allowed).toBe(true);
    expect(decision.readBackRequired).toBe(true);
    expect(decision.requiresConfirmation).toBe(false);
  });

  it('fails closed when the environment probe failed', () => {
    const decision = guard.authorize({
      source: 'owner_ui',
      riskClass: 1,
      environment: { screenLocked: false, secureDesktop: false, probeFailed: true }
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('security_probe_failed');
  });

  it('denies targets matching the sensitive denylist', () => {
    const decision = guard.authorize({
      source: 'owner_ui',
      riskClass: 2,
      environment: unlocked,
      target: { processName: 'KeePassXC' }
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('sensitive_process');
  });
});

describe('isSensitiveTarget', () => {
  it('matches password managers by process, title and target', () => {
    expect(isSensitiveTarget({ processName: '1Password.exe' }).denied).toBe(true);
    expect(isSensitiveTarget({ windowTitle: 'Enter your password' }).denied).toBe(true);
    expect(isSensitiveTarget({ target: 'bitwarden' }).denied).toBe(true);
  });

  it('does not deny ordinary windows', () => {
    expect(isSensitiveTarget({ processName: 'notepad', windowTitle: 'Untitled - Notepad', target: 'notepad' }).denied).toBe(false);
  });

  it('uses the supplied policy', () => {
    const policy = { ...defaultDenylistPolicy, processes: ['myblockedapp'] };
    expect(isSensitiveTarget({ processName: 'myblockedapp' }, policy).denied).toBe(true);
    expect(isSensitiveTarget({ processName: 'keepass' }, policy).denied).toBe(false);
  });
});

describe('EmergencyStop', () => {
  it('aborts every armed controller and refuses new work', () => {
    const stop = new EmergencyStop();
    const first = new AbortController();
    const second = new AbortController();
    const disarm = stop.arm(first);
    stop.arm(second);

    expect(stop.stopAll()).toBe(2);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(stop.isStopped()).toBe(true);

    const late = new AbortController();
    stop.arm(late);
    expect(late.signal.aborted).toBe(true);

    disarm();
    stop.reset();
    expect(stop.isStopped()).toBe(false);
  });
});
