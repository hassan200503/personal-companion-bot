import { afterEach, describe, expect, it, vi } from 'vitest';
import { webResearch } from './web-research.js';

type FetchFn = typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('webResearch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a summary and sources from DDG + Wikipedia (happy path)', async () => {
    const fetchImpl: FetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.duckduckgo.com')) {
        return jsonResponse({
          Heading: 'Mars',
          AbstractText: 'Mars is the fourth planet from the Sun.',
          AbstractURL: 'https://en.wikipedia.org/wiki/Mars',
          AbstractSource: 'Wikipedia',
          RelatedTopics: [
            { Text: 'Olympus Mons - tallest volcano', FirstURL: 'https://duckduckgo.com/Olympus_Mons' },
          ],
        });
      }
      if (url.includes('/api/rest_v1/page/summary/')) {
        return jsonResponse({
          title: 'Mars',
          type: 'standard',
          extract: 'Mars is a terrestrial planet with a thin atmosphere.',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Mars' } },
        });
      }
      if (url.includes('action=opensearch')) {
        return jsonResponse(['Mars', ['Mars'], ['red planet'], ['https://en.wikipedia.org/wiki/Mars']]);
      }
      return jsonResponse({}, 404);
    });

    const result = await webResearch({ query: 'Mars', fetchImpl });

    expect(result.error).toBeUndefined();
    expect(result.contentTrust).toBe('untrusted_content');
    expect(result.summary).toContain('Mars is the fourth planet');
    expect(result.summary).toContain('Olympus Mons');
    expect(result.summary.length).toBeLessThanOrEqual(1200);
    expect(result.sources.some((s) => s.url.includes('wikipedia.org/wiki/Mars'))).toBe(true);
    expect(result.sources.some((s) => s.url.includes('Olympus_Mons'))).toBe(true);
  });

  it('returns no_results when APIs are empty (does not invent facts)', async () => {
    const fetchImpl: FetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.duckduckgo.com')) {
        return jsonResponse({
          Heading: '',
          AbstractText: '',
          AbstractURL: '',
          RelatedTopics: [],
        });
      }
      if (url.includes('action=opensearch')) {
        return jsonResponse(['xyzzy-no-hit', [], [], []]);
      }
      if (url.includes('/api/rest_v1/page/summary/')) {
        return jsonResponse({}, 404);
      }
      return jsonResponse({}, 404);
    });

    const result = await webResearch({ query: 'xyzzy-no-hit-unique-query', fetchImpl });

    expect(result.error).toBe('no_results');
    expect(result.summary).toBe('');
    expect(result.contentTrust).toBe('untrusted_content');
    expect(result.sources).toEqual([]);
  });
});
