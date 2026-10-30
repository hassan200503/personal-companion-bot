/**
 * Official-API web research (DuckDuckGo Instant Answer + Wikipedia REST).
 * Results are untrusted external content — never invent facts when APIs are empty.
 */

const SUMMARY_MAX = 1200;

export interface WebResearchSource {
  title: string;
  url: string;
}

export interface WebResearchResult {
  summary: string;
  sources: WebResearchSource[];
  opened?: boolean;
  error?: string;
  contentTrust: 'untrusted_content';
}

export interface WebResearchInput {
  query: string;
  openSources?: boolean;
  readAloud?: boolean;
}

export interface WebResearchOptions extends WebResearchInput {
  signal?: AbortSignal;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

interface DdgRelatedTopic {
  Text?: string;
  FirstURL?: string;
  Name?: string;
  Topics?: DdgRelatedTopic[];
}

interface DdgInstantAnswer {
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  Heading?: string;
  Answer?: string;
  Definition?: string;
  DefinitionURL?: string;
  RelatedTopics?: DdgRelatedTopic[];
}

interface WikiSummary {
  title?: string;
  extract?: string;
  type?: string;
  content_urls?: { desktop?: { page?: string } };
}

function untrusted(partial: Omit<WebResearchResult, 'contentTrust'>): WebResearchResult {
  return { ...partial, contentTrust: 'untrusted_content' };
}

function addSource(sources: WebResearchSource[], title: string, url: string): void {
  const t = title.trim();
  const u = url.trim();
  if (!t || !u) return;
  if (sources.some((s) => s.url === u)) return;
  sources.push({ title: t, url: u });
}

function flattenRelated(topics: DdgRelatedTopic[] | undefined, out: { text: string; url?: string }[], limit = 5): void {
  if (!topics || out.length >= limit) return;
  for (const topic of topics) {
    if (out.length >= limit) break;
    if (topic.Topics?.length) {
      flattenRelated(topic.Topics, out, limit);
      continue;
    }
    if (topic.Text) out.push({ text: topic.Text, url: topic.FirstURL });
  }
}

function clipSpoken(text: string, max = SUMMARY_MAX): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  const slice = cleaned.slice(0, max - 1);
  const lastStop = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  if (lastStop >= Math.floor(max * 0.5)) return `${slice.slice(0, lastStop + 1).trim()}`;
  return `${slice.trim()}…`;
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetchImpl(url, {
      signal,
      headers: { Accept: 'application/json', 'User-Agent': 'CompanionBot/1.0 (web.research)' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchDdg(query: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<DdgInstantAnswer | null> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  return fetchJson<DdgInstantAnswer>(url, fetchImpl, signal);
}

async function fetchWikiSummary(title: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<WikiSummary | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const data = await fetchJson<WikiSummary>(url, fetchImpl, signal);
  if (!data || data.type === 'disambiguation') return data;
  return data;
}

async function wikiOpenSearch(query: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ title: string; url: string; description?: string }[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json`;
  const data = await fetchJson<[string, string[], string[], string[]]>(url, fetchImpl, signal);
  if (!data || !Array.isArray(data) || data.length < 4) return [];
  const titles = data[1] ?? [];
  const descriptions = data[2] ?? [];
  const urls = data[3] ?? [];
  const out: { title: string; url: string; description?: string }[] = [];
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    const pageUrl = urls[i];
    if (!title || !pageUrl) continue;
    out.push({ title, url: pageUrl, description: descriptions[i] });
  }
  return out;
}

function titleFromWikiUrl(abstractUrl: string | undefined, heading: string | undefined): string | null {
  if (heading?.trim()) return heading.trim();
  if (!abstractUrl) return null;
  try {
    const path = new URL(abstractUrl).pathname;
    const raw = path.split('/').pop();
    if (!raw) return null;
    return decodeURIComponent(raw.replace(/_/g, ' '));
  } catch {
    return null;
  }
}

/**
 * Research a query via DuckDuckGo Instant Answer + Wikipedia official APIs.
 * Does not scrape SPA HTML. Never invents facts when APIs return empty.
 */
export async function webResearch(options: WebResearchOptions): Promise<WebResearchResult> {
  const query = options.query.trim();
  if (!query) return untrusted({ summary: '', sources: [], error: 'no_results' });
  if (options.signal?.aborted) return untrusted({ summary: '', sources: [], error: 'aborted' });

  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sources: WebResearchSource[] = [];
  const parts: string[] = [];

  const ddg = await fetchDdg(query, fetchImpl, options.signal);

  if (ddg?.Answer?.trim()) {
    parts.push(ddg.Answer.trim());
  }
  if (ddg?.AbstractText?.trim()) {
    parts.push(ddg.AbstractText.trim());
  }
  if (ddg?.Definition?.trim()) {
    parts.push(ddg.Definition.trim());
  }

  if (ddg?.AbstractURL) {
    addSource(sources, ddg.AbstractSource || ddg.Heading || 'DuckDuckGo', ddg.AbstractURL);
  }
  if (ddg?.DefinitionURL) {
    addSource(sources, 'Definition', ddg.DefinitionURL);
  }

  const related: { text: string; url?: string }[] = [];
  flattenRelated(ddg?.RelatedTopics, related, 5);
  for (const item of related) {
    if (item.text) parts.push(item.text);
    if (item.url) {
      const title = item.text.split(' - ')[0]?.trim() || item.text.slice(0, 80);
      addSource(sources, title, item.url);
    }
  }

  let wiki: WikiSummary | null = null;
  const wikiTitle = titleFromWikiUrl(ddg?.AbstractURL, ddg?.Heading);
  if (wikiTitle) {
    wiki = await fetchWikiSummary(wikiTitle, fetchImpl, options.signal);
  }
  if (!wiki?.extract?.trim()) {
    const searchHits = await wikiOpenSearch(query, fetchImpl, options.signal);
    for (const hit of searchHits) {
      addSource(sources, hit.title, hit.url);
      if (hit.description?.trim()) parts.push(`${hit.title}: ${hit.description.trim()}`);
    }
    const top = searchHits[0];
    if (top) {
      wiki = await fetchWikiSummary(top.title, fetchImpl, options.signal);
    }
  }

  if (wiki?.extract?.trim()) {
    const extract = wiki.extract.trim();
    if (!parts.some((p) => p.includes(extract.slice(0, Math.min(80, extract.length))))) {
      parts.push(extract);
    }
    const pageUrl = wiki.content_urls?.desktop?.page;
    if (pageUrl) addSource(sources, wiki.title || 'Wikipedia', pageUrl);
  } else if (wiki?.content_urls?.desktop?.page) {
    addSource(sources, wiki.title || 'Wikipedia', wiki.content_urls.desktop.page);
  }

  const summary = clipSpoken(parts.join(' '));
  if (!summary) {
    return untrusted({ summary: '', sources, error: 'no_results' });
  }

  let opened: boolean | undefined;
  if (options.openSources && sources[0]?.url) {
    try {
      const { openTarget } = await import('../os-control/windows.js');
      const r = await openTarget(sources[0].url, options.signal);
      opened = r.opened;
    } catch {
      opened = false;
    }
  }

  // readAloud is a hint for the desktop VoiceService / WinRT path — do not
  // speak here via PowerShell System.Speech (conversation TTS is unified there).
  void options.readAloud;

  return untrusted({ summary, sources, opened });
}
