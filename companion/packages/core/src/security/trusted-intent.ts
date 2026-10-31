import type { AuthorizationDecision, AuthorizationInput } from './contracts.js';
import { isSensitiveTarget } from './target-guard.js';

const UNUSUAL_CONTENT_LENGTH = 300;

export class TrustedIntentGuard {
  authorize(input: AuthorizationInput): AuthorizationDecision {
    if (input.riskClass === 4) {
      return deny('class_4_restricted');
    }

    if (input.source !== 'owner_ui' && input.source !== 'owner_voice') {
      return deny(`${input.source}_cannot_grant_intent`);
    }

    if (input.environment.probeFailed) {
      return deny('security_probe_failed');
    }

    if (input.environment.screenLocked) {
      return deny('screen_locked');
    }

    if (input.environment.secureDesktop) {
      return deny('secure_desktop');
    }

    const target = isSensitiveTarget(input.target);
    if (target.denied) {
      return deny(target.reason ?? 'sensitive_target');
    }

    if (input.riskClass === 1) {
      return allow();
    }

    if (input.riskClass === 2) {
      return {
        allowed: true,
        requiresConfirmation: false,
        explicitYesRequired: false,
        readBackRequired: input.source === 'owner_voice',
      };
    }

    const unusual =
      input.firstTimeRecipient === true ||
      input.ambiguousRecipient === true ||
      input.hasAttachment === true ||
      input.hasUnknownLink === true ||
      input.involvesMoney === true ||
      (input.contentLength ?? 0) > UNUSUAL_CONTENT_LENGTH;

    return {
      allowed: true,
      requiresConfirmation: true,
      explicitYesRequired: unusual,
      readBackRequired: false, // Class 3 uses confirmation flow, not read-back
    };
  }
}

function allow(): AuthorizationDecision {
  return {
    allowed: true,
    requiresConfirmation: false,
    explicitYesRequired: false,
    readBackRequired: false,
  };
}

function deny(reason: string): AuthorizationDecision {
  return {
    allowed: false,
    reason,
    requiresConfirmation: false,
    explicitYesRequired: false,
    readBackRequired: false,
  };
}
