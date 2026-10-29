export interface FixtureContact {
  id: string;
  name: string;
  number: string;
  lastSeen?: string;
}

export interface OutgoingMessage {
  id: string;
  contactId: string;
  text: string;
  createdAt: number;
}

export type ContactResolution =
  | { status: 'resolved'; contact: FixtureContact }
  | { status: 'ambiguous'; candidates: FixtureContact[] }
  | { status: 'not_found' };

export type PresenceRequest = 'read_once' | 'monitor' | 'alert';

export function authorizePresenceRequest(request: PresenceRequest): { allowed: boolean; reason?: string } {
  return request === 'read_once'
    ? { allowed: true }
    : { allowed: false, reason: 'presence_monitoring_forbidden' };
}

export class FixtureMessenger {
  private readonly outgoing: OutgoingMessage[] = [];

  constructor(private readonly contacts: readonly FixtureContact[], private readonly hourlyCap = 20, private readonly now = () => Date.now()) {}

  resolveContact(query: string): ContactResolution {
    const normalized = normalize(query);
    const matches = this.contacts.filter((contact) => normalize(contact.name).includes(normalized) || contact.number.includes(normalized));
    if (matches.length === 1) return { status: 'resolved', contact: matches[0]! };
    if (matches.length > 1) return { status: 'ambiguous', candidates: [...matches] };
    return { status: 'not_found' };
  }

  send(contactId: string, text: string, confirmed: boolean): { status: 'sent' | 'needs_confirmation' | 'rate_limited' | 'not_found'; message?: OutgoingMessage } {
    const contact = this.contacts.find((candidate) => candidate.id === contactId);
    if (!contact) return { status: 'not_found' };
    if (!confirmed) return { status: 'needs_confirmation' };
    const cutoff = this.now() - 60 * 60 * 1000;
    const recent = this.outgoing.filter((message) => message.createdAt >= cutoff);
    if (recent.length >= this.hourlyCap) return { status: 'rate_limited' };
    const message = { id: `fixture-${this.outgoing.length + 1}`, contactId, text, createdAt: this.now() };
    this.outgoing.push(message);
    return { status: 'sent', message };
  }

  verifyOutgoing(contactId: string, text: string): boolean {
    return this.outgoing.some((message) => message.contactId === contactId && message.text === text);
  }

  readLastSeen(contactId: string, request: PresenceRequest = 'read_once'): string {
    if (!authorizePresenceRequest(request).allowed) return 'not available';
    const contact = this.contacts.find((candidate) => candidate.id === contactId);
    return contact?.lastSeen ?? 'not shown';
  }

  listOutgoing(): readonly OutgoingMessage[] { return [...this.outgoing]; }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
