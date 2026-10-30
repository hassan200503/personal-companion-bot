/**
 * Rank inbox messages by unread status, subject/body keywords, and sender patterns.
 */

export interface RankableMessage {
  uid: number;
  subject: string;
  from: string;
  snippet?: string;
  text?: string;
  unseen?: boolean;
  date?: string;
}

export interface RankedMessage extends RankableMessage {
  score: number;
  reasons: string[];
}

/** High-signal career / finance / ops keywords. */
export const IMPORTANCE_KEYWORDS = [
  'interview',
  'offer',
  'invoice',
  'deadline',
  'bank',
  'contract',
  'salary',
  'java',
  'recruiter',
  'linkedin',
] as const;

const SENDER_PATTERNS: Array<{ re: RegExp; label: string; weight: number }> = [
  { re: /linkedin\.com/i, label: 'linkedin_sender', weight: 4 },
  { re: /noreply@linkedin/i, label: 'linkedin_noreply', weight: 3 },
  { re: /@.*recruit/i, label: 'recruiter_domain', weight: 5 },
  { re: /talent|careers|jobs@/i, label: 'careers_sender', weight: 4 },
  { re: /invoice|billing|payments?@/i, label: 'billing_sender', weight: 5 },
  { re: /bank|paypal|stripe|wise@/i, label: 'finance_sender', weight: 5 },
  { re: /hr@|people@|hiring@/i, label: 'hr_sender', weight: 4 },
];

const KEYWORD_WEIGHT = 3;
const UNREAD_WEIGHT = 5;
const IMPORTANT_THRESHOLD = 5;

export function scoreMessage(message: RankableMessage): RankedMessage {
  const reasons: string[] = [];
  let score = 0;
  const haystack = `${message.subject}\n${message.snippet ?? ''}\n${message.text ?? ''}`.toLowerCase();
  const from = message.from ?? '';

  if (message.unseen) {
    score += UNREAD_WEIGHT;
    reasons.push('unread');
  }

  for (const keyword of IMPORTANCE_KEYWORDS) {
    if (haystack.includes(keyword)) {
      score += KEYWORD_WEIGHT;
      reasons.push(`keyword:${keyword}`);
    }
  }

  for (const pattern of SENDER_PATTERNS) {
    if (pattern.re.test(from)) {
      score += pattern.weight;
      reasons.push(pattern.label);
    }
  }

  return { ...message, score, reasons };
}

/** Sort high → low; stable for equal scores by uid desc. */
export function rankMessages(messages: readonly RankableMessage[]): RankedMessage[] {
  return messages
    .map(scoreMessage)
    .sort((a, b) => b.score - a.score || b.uid - a.uid);
}

export function pickImportant(
  messages: readonly RankableMessage[],
  options?: { limit?: number; minScore?: number }
): RankedMessage[] {
  const limit = options?.limit ?? 10;
  const minScore = options?.minScore ?? IMPORTANT_THRESHOLD;
  return rankMessages(messages).filter((m) => m.score >= minScore).slice(0, limit);
}

/** Structured plain-text digest (no LLM). */
export function summarizeMessages(
  messages: readonly RankableMessage[],
  options?: { title?: string; maxItems?: number }
): string {
  const title = options?.title ?? 'Email summary';
  const maxItems = options?.maxItems ?? 15;
  if (messages.length === 0) {
    return `${title}: no messages.`;
  }
  const ranked = rankMessages(messages).slice(0, maxItems);
  const unread = messages.filter((m) => m.unseen).length;
  const lines: string[] = [
    `${title}: ${messages.length} message(s), ${unread} unread.`,
    '',
  ];
  for (const m of ranked) {
    const flag = m.unseen ? 'UNREAD' : 'read';
    const snip = (m.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    lines.push(`• [${flag}] ${m.subject} — from ${m.from || 'unknown'}${snip ? `: ${snip}` : ''}`);
  }
  return lines.join('\n');
}

/** Speakable digest for TTS. */
export function speakableDigest(
  messages: readonly RankableMessage[],
  options?: { importantOnly?: boolean; limit?: number }
): string {
  const limit = options?.limit ?? 5;
  const pool = options?.importantOnly ? pickImportant(messages, { limit }) : rankMessages(messages).slice(0, limit);
  if (pool.length === 0) {
    return options?.importantOnly
      ? 'There are no high-importance emails right now.'
      : 'There are no recent emails to read.';
  }
  const parts: string[] = [];
  if (options?.importantOnly) {
    parts.push(`You have ${pool.length} important email${pool.length === 1 ? '' : 's'}.`);
  } else {
    parts.push(`Here are your ${pool.length} most recent email${pool.length === 1 ? '' : 's'}.`);
  }
  for (let i = 0; i < pool.length; i++) {
    const m = pool[i]!;
    const unread = m.unseen ? 'Unread. ' : '';
    const snip = (m.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    parts.push(
      `${i + 1}. ${unread}Subject: ${m.subject}. From: ${m.from || 'unknown'}.${snip ? ` ${snip}` : ''}`
    );
  }
  return parts.join(' ');
}

export function speakableMessage(message: RankableMessage & { text?: string }): string {
  const body = (message.text || message.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 800);
  return `Email from ${message.from || 'unknown'}. Subject: ${message.subject}. ${body}`;
}
