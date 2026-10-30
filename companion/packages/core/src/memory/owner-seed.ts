/**
 * One-time career defaults for an empty / goals-missing owner.profile.
 * Never overwrites keys the owner already set.
 */

export const OWNER_CAREER_SEED = {
  occupation: 'Full-stack Java developer',
  goals: ['career growth', 'money', 'finding strong engineering roles'],
  interests: ['Java', 'full-stack', 'finance/career'],
  notes: 'deep thinker companion should proactively surface roles/opportunities aligned with goals',
} as const;

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function ownerNeedsCareerSeed(owner: unknown): boolean {
  if (owner == null || typeof owner !== 'object') return true;
  const record = owner as Record<string, unknown>;
  if (Object.keys(record).length === 0) return true;
  return isBlank(record.goals);
}

/**
 * Merge career defaults into missing owner.profile keys only.
 * Optional nameHint fills `name` when absent.
 */
export function seedOwnerCareerProfile(
  existing: unknown,
  options: { nameHint?: string } = {}
): { profile: Record<string, unknown>; seeded: boolean } {
  const profile: Record<string, unknown> =
    existing !== null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};

  if (!ownerNeedsCareerSeed(profile)) {
    return { profile, seeded: false };
  }

  let seeded = false;

  if (isBlank(profile.occupation)) {
    profile.occupation = OWNER_CAREER_SEED.occupation;
    seeded = true;
  }
  if (isBlank(profile.goals)) {
    profile.goals = [...OWNER_CAREER_SEED.goals];
    seeded = true;
  }
  if (isBlank(profile.interests)) {
    profile.interests = [...OWNER_CAREER_SEED.interests];
    seeded = true;
  }
  if (isBlank(profile.notes)) {
    profile.notes = OWNER_CAREER_SEED.notes;
    seeded = true;
  }
  if (isBlank(profile.name) && options.nameHint?.trim()) {
    profile.name = options.nameHint.trim();
    seeded = true;
  }

  return { profile, seeded };
}
