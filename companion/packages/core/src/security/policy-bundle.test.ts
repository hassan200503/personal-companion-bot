import { describe, expect, it } from 'vitest';
import { getPolicyBundle, policyBundleHash, verifyPolicyBundle } from './policy-bundle.js';

describe('policy bundle integrity', () => {
  it('is immutable and verifies its built-in hash', () => {
    const bundle = getPolicyBundle();
    expect(Object.isFrozen(bundle)).toBe(true);
    expect(Object.isFrozen(bundle.riskClasses)).toBe(true);
    expect(verifyPolicyBundle()).toBe(true);
    expect(policyBundleHash()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a tampered bundle', () => {
    const tampered = { ...getPolicyBundle(), riskClasses: { ...getPolicyBundle().riskClasses, class4Blocked: false } };
    expect(verifyPolicyBundle(tampered)).toBe(false);
  });
});
