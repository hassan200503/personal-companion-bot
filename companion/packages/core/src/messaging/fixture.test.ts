import { describe, expect, it } from 'vitest';
import { authorizePresenceRequest, FixtureMessenger } from './fixture.js';

describe('fixture messenger end-to-end flow', () => {
  it('resolves ambiguity, requires confirmation, and reports sent only after observation', () => {
    let now = 1_000_000;
    const messenger = new FixtureMessenger([
      { id: 'a', name: 'Alex Kim', number: '+254700000001', lastSeen: 'online' },
      { id: 'b', name: 'Alex Mwangi', number: '+254700000002' }
    ], 20, () => now);

    const ambiguous = messenger.resolveContact('Alex');
    expect(ambiguous.status).toBe('ambiguous');
    const selected = ambiguous.status === 'ambiguous' ? ambiguous.candidates[0]! : undefined;
    expect(selected?.id).toBe('a');
    expect(messenger.send(selected!.id, 'Hello', false).status).toBe('needs_confirmation');
    const sent = messenger.send(selected!.id, 'Hello', true);
    expect(sent.status).toBe('sent');
    expect(messenger.verifyOutgoing(selected!.id, 'Hello')).toBe(true);
    expect(messenger.readLastSeen(selected!.id)).toBe('online');
    expect(messenger.readLastSeen('b')).toBe('not shown');
    expect(messenger.readLastSeen('a', 'monitor')).toBe('not available');
    now += 3_600_001;
  });

  it('enforces the hourly cap', () => {
    const messenger = new FixtureMessenger([{ id: 'a', name: 'A', number: '1' }], 1, () => 5_000);
    expect(messenger.send('a', 'one', true).status).toBe('sent');
    expect(messenger.send('a', 'two', true).status).toBe('rate_limited');
  });

  it('allows only a one-shot presence read', () => {
    expect(authorizePresenceRequest('read_once').allowed).toBe(true);
    expect(authorizePresenceRequest('monitor').allowed).toBe(false);
    expect(authorizePresenceRequest('alert').allowed).toBe(false);
  });
});
