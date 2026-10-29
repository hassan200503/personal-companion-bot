import { describe, expect, it } from 'vitest';
import { MediaFallbackChain, resolveLocalMedia } from './resolver.js';

const entries = [
  { path: 'a.mp3', title: 'Nairobi Nights', artist: 'Amani' },
  { path: 'b.mp3', title: 'Nairobi Nights Live', artist: 'Amani' },
  { path: 'c.mp3', title: 'Blue Hour', artist: 'Kito' }
];

describe('media resolver', () => {
  it('ranks a strong local match and disambiguates close matches', () => {
    expect(resolveLocalMedia('Nairobi Nights', entries).status).toBe('matched');
    expect(resolveLocalMedia('Nairobi', entries).status).toBe('ambiguous');
    expect(resolveLocalMedia('unknown', entries).status).toBe('not_found');
  });

  it('uses an official fallback and tracks daily quota', async () => {
    let calls = 0;
    const chain = new MediaFallbackChain([{ id: 'youtube', search: async () => { calls += 1; return { opened: true, selectedByOwner: false, url: 'https://youtube.com/results' }; } }], 1, () => '2026-10-29');
    expect((await chain.search('song')).provider).toBe('youtube');
    expect((await chain.search('song')).error).toBe('no_fallback_available');
    expect(calls).toBe(1);
  });
});
