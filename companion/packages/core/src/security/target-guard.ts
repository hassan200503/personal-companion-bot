import type { DenylistPolicy, SensitiveTarget } from './contracts.js';

const PROCESSES = [
  'keepass',
  'keepassxc',
  '1password',
  'onepassword',
  'bitwarden',
  'lastpass',
  'dashlane',
  'nordpass',
  'protonpass',
  'keeper',
  'enpass',
  'roboform',
  'windowssecurity',
  'securityhealth',
  'consent',
  'logonui',
  'winlogon',
  'lsass',
  'credentialui',
  'useraccountcontrol',
] as const;

const TITLE_PATTERNS = [
  /password/i,
  /passkey/i,
  /credential/i,
  /sign\s*in/i,
  /log\s*in/i,
  /authentication/i,
  /\bbank(ing)?\b/i,
  /\bpayment(s)?\b/i,
  /windows security/i,
  /user account control/i,
  /\buac\b/i,
  /unlock/i,
  /recovery key/i,
] as const;

const TARGET_PATTERNS = [
  /keepass/i,
  /1password/i,
  /bitwarden/i,
  /lastpass/i,
  /dashlane/i,
  /nordpass/i,
  /proton\s*pass/i,
  /keeper/i,
  /enpass/i,
  /roboform/i,
  /password\s*manager/i,
  /windows\s*security/i,
  /user\s*account\s*control/i,
] as const;

export const defaultDenylistPolicy: DenylistPolicy = {
  processes: PROCESSES,
  titlePatterns: TITLE_PATTERNS,
  targetPatterns: TARGET_PATTERNS,
};

function matchesProcess(processName: string | undefined, policy: DenylistPolicy): boolean {
  if (!processName) return false;
  const normalized = processName
    .toLowerCase()
    .replace(/\.exe$/i, '')
    .replace(/[\s_-]+/g, '');
  return policy.processes.some((entry) => {
    const candidate = entry.toLowerCase().replace(/[\s_-]+/g, '');
    return normalized === candidate || normalized.includes(candidate);
  });
}

function matchesAny(value: string | undefined, patterns: readonly RegExp[]): boolean {
  if (!value) return false;
  return patterns.some((pattern) => pattern.test(value));
}

export function isSensitiveTarget(
  target: SensitiveTarget | undefined,
  policy: DenylistPolicy = defaultDenylistPolicy
): { denied: boolean; reason?: string } {
  if (!target) return { denied: false };

  if (matchesProcess(target.processName, policy)) {
    return { denied: true, reason: 'sensitive_process' };
  }

  if (matchesAny(target.windowTitle, policy.titlePatterns)) {
    return { denied: true, reason: 'sensitive_window_title' };
  }

  if (matchesAny(target.target, policy.targetPatterns)) {
    return { denied: true, reason: 'sensitive_target' };
  }

  return { denied: false };
}
