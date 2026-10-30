import type { ProactiveCandidate } from './engine.js';

export interface OwnerCareerLike {
  occupation?: unknown;
  goals?: unknown;
  interests?: unknown;
  notes?: unknown;
  name?: unknown;
}

export interface EmailImportantItem {
  id?: string;
  subject?: string;
  from?: string;
  important?: boolean;
  receivedAt?: number;
}

function asTextList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function ownerCareerBlob(owner: OwnerCareerLike | null | undefined): string {
  if (!owner) return '';
  return [
    ...asTextList(owner.occupation),
    ...asTextList(owner.goals),
    ...asTextList(owner.interests),
    ...asTextList(owner.notes),
  ].join(' ');
}

/** True when owner goals/context mention java, career, or engineering roles. */
export function ownerWantsCareerDigest(owner: OwnerCareerLike | null | undefined): boolean {
  return /\b(java|career|role|roles|engineering)\b/i.test(ownerCareerBlob(owner));
}

export function buildCareerCandidates(
  owner: OwnerCareerLike | null | undefined,
  now: number
): ProactiveCandidate[] {
  if (!ownerWantsCareerDigest(owner)) return [];
  const day = new Date(now).toISOString().slice(0, 10);
  const occupation = asTextList(owner?.occupation)[0] || 'engineering';
  return [{
    id: `career-${day}`,
    topic: 'career',
    message: `Want a quick scan for strong ${occupation} roles aligned with your career goals?`,
    reason: 'Owner goals mention Java, career growth, or engineering roles',
    urgency: 0.25,
    importance: 0.62,
    createdAt: now,
  }];
}

export function buildEmailImportantCandidates(
  items: readonly EmailImportantItem[] | null | undefined,
  now: number
): ProactiveCandidate[] {
  if (!items?.length) return [];
  const out: ProactiveCandidate[] = [];
  for (const item of items) {
    if (!item?.important) continue;
    const id = item.id?.trim() || `email-${item.receivedAt ?? now}`;
    const subject = (item.subject ?? 'an important message').replace(/\s+/g, ' ').trim().slice(0, 120);
    const from = (item.from ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    out.push({
      id: `email-important-${id}`,
      topic: 'email-important',
      message: from
        ? `Important email from ${from}: ${subject}`
        : `Important email: ${subject}`,
      reason: 'Marked important in the inbox digest',
      urgency: 0.7,
      importance: 0.8,
      createdAt: item.receivedAt ?? now,
    });
  }
  return out;
}
