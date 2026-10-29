export type IntentSource = 'owner_ui' | 'owner_voice' | 'untrusted_content' | 'system';

export type RiskClass = 1 | 2 | 3 | 4;

export type IntegrityLevel = 'low' | 'medium' | 'high' | 'system' | 'unknown';

export interface EnvironmentSnapshot {
  screenLocked: boolean;
  secureDesktop: boolean;
  foregroundProcess?: string;
  foregroundTitle?: string;
  integrityLevel?: IntegrityLevel;
  probeFailed?: boolean;
}

export interface SensitiveTarget {
  processName?: string;
  windowTitle?: string;
  target?: string;
}

export interface DenylistPolicy {
  processes: readonly string[];
  titlePatterns: readonly RegExp[];
  targetPatterns: readonly RegExp[];
}

export interface AuthorizationInput {
  source: IntentSource;
  riskClass: RiskClass;
  environment: EnvironmentSnapshot;
  target?: SensitiveTarget;
  firstTimeRecipient?: boolean;
  hasAttachment?: boolean;
  hasUnknownLink?: boolean;
  involvesMoney?: boolean;
  ambiguousRecipient?: boolean;
  contentLength?: number;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
  explicitYesRequired: boolean;
  readBackRequired: boolean;
}
