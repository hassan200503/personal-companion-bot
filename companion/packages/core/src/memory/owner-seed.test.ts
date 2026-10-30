import { describe, expect, it } from 'vitest';
import { OWNER_CAREER_SEED, ownerNeedsCareerSeed, seedOwnerCareerProfile } from './owner-seed.js';

describe('owner career seed', () => {
  it('seeds empty profiles and missing goals without overwriting set keys', () => {
    expect(ownerNeedsCareerSeed({})).toBe(true);
    const empty = seedOwnerCareerProfile({}, { nameHint: 'Hassan' });
    expect(empty.seeded).toBe(true);
    expect(empty.profile.name).toBe('Hassan');
    expect(empty.profile.occupation).toBe(OWNER_CAREER_SEED.occupation);
    expect(empty.profile.goals).toEqual([...OWNER_CAREER_SEED.goals]);

    const partial = seedOwnerCareerProfile({
      name: 'Ada',
      occupation: 'Staff engineer',
      goals: [],
    });
    expect(partial.seeded).toBe(true);
    expect(partial.profile.name).toBe('Ada');
    expect(partial.profile.occupation).toBe('Staff engineer');
    expect(partial.profile.goals).toEqual([...OWNER_CAREER_SEED.goals]);
    expect(partial.profile.interests).toEqual([...OWNER_CAREER_SEED.interests]);
  });

  it('skips when goals already exist', () => {
    const existing = { goals: ['ship the launcher'], occupation: 'IC' };
    expect(ownerNeedsCareerSeed(existing)).toBe(false);
    const result = seedOwnerCareerProfile(existing);
    expect(result.seeded).toBe(false);
    expect(result.profile).toEqual(existing);
  });
});
