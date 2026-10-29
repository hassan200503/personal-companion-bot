export interface MediaEntry {
  path: string;
  title: string;
  artist?: string;
  album?: string;
}

export interface MediaCandidate extends MediaEntry {
  score: number;
}

export interface MediaResolution {
  status: 'matched' | 'ambiguous' | 'not_found';
  candidates: MediaCandidate[];
}

export function resolveLocalMedia(query: string, entries: readonly MediaEntry[]): MediaResolution {
  const terms = tokens(query);
  if (terms.length === 0) return { status: 'not_found', candidates: [] };
  const candidates = entries.map((entry) => ({ ...entry, score: score(entry, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  if (candidates.length === 0) return { status: 'not_found', candidates: [] };
  const top = candidates[0]!;
  const second = candidates[1];
  const strong = top.score >= 0.75 && (!second || top.score - second.score >= 0.15);
  return { status: strong ? 'matched' : 'ambiguous', candidates: candidates.slice(0, 5) };
}

export interface FallbackProvider {
  id: 'spotify' | 'youtube';
  search(query: string): Promise<{ opened: boolean; selectedByOwner: boolean; url?: string }>;
}

export class MediaFallbackChain {
  private readonly used = new Map<string, number>();
  constructor(private readonly providers: readonly FallbackProvider[], private readonly dailyCap = 100, private readonly day = () => new Date().toISOString().slice(0, 10)) {}

  async search(query: string): Promise<{ provider?: string; opened: boolean; selectedByOwner: boolean; url?: string; error?: string }> {
    const day = this.day();
    for (const provider of this.providers) {
      const key = `${day}:${provider.id}`;
      const count = this.used.get(key) ?? 0;
      if (count >= this.dailyCap) continue;
      this.used.set(key, count + 1);
      const result = await provider.search(query);
      if (result.opened) return { provider: provider.id, ...result };
    }
    return { opened: false, selectedByOwner: false, error: 'no_fallback_available' };
  }
}

function tokens(value: string): string[] { return value.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1); }

function score(entry: MediaEntry, terms: string[]): number {
  const title = tokens(entry.title);
  const metadata = tokens([entry.artist, entry.album].filter(Boolean).join(' '));
  const matched = terms.filter((term) => title.includes(term) || metadata.includes(term)).length;
  const exact = terms.join(' ') === title.join(' ');
  return Math.min(1, matched / terms.length * 0.75 + (exact ? 0.25 : 0));
}
