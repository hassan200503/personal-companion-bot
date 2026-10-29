import { createHash } from 'node:crypto';

export interface PolicyBundle {
  schemaVersion: 1;
  riskClasses: {
    class4Blocked: true;
    class3RequiresConfirmation: true;
    externalContentCannotGrantIntent: true;
    lockedSessionDenied: true;
  };
  source: 'built-in';
}

const bundle: PolicyBundle = Object.freeze({
  schemaVersion: 1,
  riskClasses: Object.freeze({
    class4Blocked: true,
    class3RequiresConfirmation: true,
    externalContentCannotGrantIntent: true,
    lockedSessionDenied: true,
  }),
  source: 'built-in',
});

const bundleHash = hash(bundle);

export function getPolicyBundle(): PolicyBundle { return bundle; }

export function verifyPolicyBundle(candidate: unknown = bundle): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  const value = candidate as Partial<PolicyBundle>;
  return value.schemaVersion === 1
    && value.source === 'built-in'
    && value.riskClasses?.class4Blocked === true
    && value.riskClasses.class3RequiresConfirmation === true
    && value.riskClasses.externalContentCannotGrantIntent === true
    && value.riskClasses.lockedSessionDenied === true
    && hash(candidate) === bundleHash;
}

export function policyBundleHash(): string { return bundleHash; }

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
