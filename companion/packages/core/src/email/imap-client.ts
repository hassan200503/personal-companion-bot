/**
 * Minimal IMAP client over Node tls/net.
 * Supports LOGIN, SELECT INBOX, UID SEARCH, UID FETCH (ENVELOPE / BODY.PEEK).
 * No third-party IMAP libraries.
 */

import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  /** When true, connect with TLS from the start (typical IMAPS :993). */
  tls: boolean;
}

export interface EmailAddress {
  name: string;
  mailbox: string;
  host: string;
}

export interface EmailMessageMeta {
  uid: number;
  flags: string[];
  unseen: boolean;
  date: string;
  subject: string;
  from: string;
  to: string;
  messageId: string;
  snippet: string;
}

export interface EmailMessage extends EmailMessageMeta {
  text: string;
  headers: string;
}

export class ImapError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_configured'
      | 'connect_failed'
      | 'auth_failed'
      | 'command_failed'
      | 'timeout'
      | 'aborted'
      | 'parse_failed'
  ) {
    super(message);
    this.name = 'ImapError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const TEXT_FETCH_BYTES = 4_000;
const SNIPPET_MAX = 280;

type Conn = Socket | TLSSocket;

export class ImapClient {
  private socket: Conn | null = null;
  private buffer = '';
  private tagSeq = 0;
  private readonly waiters: Array<{
    resolve: (line: string) => void;
    reject: (err: Error) => void;
  }> = [];
  private closed = false;

  constructor(private readonly config: EmailConfig) {}

  static async withSession<T>(
    config: EmailConfig,
    fn: (client: ImapClient) => Promise<T>,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<T> {
    const client = new ImapClient(config);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const signal = options?.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      client.destroy(new ImapError('IMAP operation aborted', 'aborted'));
    };
    try {
      if (signal?.aborted) throw new ImapError('IMAP operation aborted', 'aborted');
      signal?.addEventListener('abort', abort, { once: true });
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          client.destroy(new ImapError(`IMAP timed out after ${timeoutMs}ms`, 'timeout'));
          reject(new ImapError(`IMAP timed out after ${timeoutMs}ms`, 'timeout'));
        }, timeoutMs);
      });
      const work = (async () => {
        await client.connect();
        await client.login();
        await client.selectInbox();
        return await fn(client);
      })();
      return await Promise.race([work, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      await client.logout().catch(() => undefined);
      client.destroy();
    }
  }

  async connect(): Promise<void> {
    if (this.socket) return;
    const { host, port, tls } = this.config;
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        reject(new ImapError(`Could not connect to ${host}:${port} — ${err.message}`, 'connect_failed'));
      };
      const onReady = () => {
        sock.off('error', onError);
        resolve();
      };
      const sock: Conn = tls
        ? tlsConnect({ host, port, servername: host, rejectUnauthorized: true }, onReady)
        : netConnect({ host, port }, onReady);
      sock.setEncoding('utf8');
      sock.on('error', onError);
      sock.on('data', (chunk: string | Buffer) => this.onData(typeof chunk === 'string' ? chunk : chunk.toString('utf8')));
      sock.on('close', () => this.onClose());
      this.socket = sock;
    });
    const greeting = await this.readLine();
    if (!/^\* OK/i.test(greeting)) {
      throw new ImapError(`Unexpected IMAP greeting: ${greeting.slice(0, 120)}`, 'connect_failed');
    }
  }

  async login(): Promise<void> {
    const tag = this.nextTag();
    await this.write(`${tag} LOGIN ${quote(this.config.user)} ${quote(this.config.password)}\r\n`);
    const completion = await this.readUntilTagged(tag);
    if (!completion.ok) {
      throw new ImapError('IMAP login failed — check user/password or app password', 'auth_failed');
    }
  }

  async selectInbox(): Promise<void> {
    const tag = this.nextTag();
    await this.write(`${tag} SELECT INBOX\r\n`);
    const completion = await this.readUntilTagged(tag);
    if (!completion.ok) {
      throw new ImapError('Could not SELECT INBOX', 'command_failed');
    }
  }

  /** UID SEARCH. Criteria: ALL or UNSEEN (default ALL). Returns UIDs ascending. */
  async uidSearch(criteria: 'ALL' | 'UNSEEN' = 'ALL'): Promise<number[]> {
    const tag = this.nextTag();
    await this.write(`${tag} UID SEARCH ${criteria}\r\n`);
    const { untagged, ok } = await this.readUntilTagged(tag);
    if (!ok) throw new ImapError(`UID SEARCH ${criteria} failed`, 'command_failed');
    const uids: number[] = [];
    for (const line of untagged) {
      const m = line.match(/^\* SEARCH(?:\s+(.*))?$/i);
      if (!m) continue;
      const rest = (m[1] ?? '').trim();
      if (!rest) continue;
      for (const part of rest.split(/\s+/)) {
        const n = Number(part);
        if (Number.isFinite(n) && n > 0) uids.push(n);
      }
    }
    return uids;
  }

  async fetchMeta(uids: number[], textBytes = TEXT_FETCH_BYTES): Promise<EmailMessage[]> {
    if (uids.length === 0) return [];
    const tag = this.nextTag();
    const set = uids.join(',');
    const cap = Math.max(200, Math.min(textBytes, 20_000));
    await this.write(
      `${tag} UID FETCH ${set} (UID FLAGS ENVELOPE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE MESSAGE-ID)] BODY.PEEK[TEXT]<0.${cap}>)\r\n`
    );
    const { untagged, ok, literals } = await this.readUntilTagged(tag);
    if (!ok) throw new ImapError('UID FETCH failed', 'command_failed');
    return parseFetchResponses(untagged, literals);
  }

  async fetchMessage(uid: number): Promise<EmailMessage | null> {
    const messages = await this.fetchMeta([uid], 12_000);
    return messages[0] ?? null;
  }

  async logout(): Promise<void> {
    if (!this.socket || this.closed) return;
    try {
      const tag = this.nextTag();
      await this.write(`${tag} LOGOUT\r\n`);
      await this.readUntilTagged(tag).catch(() => undefined);
    } catch {
      // ignore logout errors
    }
  }

  destroy(err?: Error): void {
    this.closed = true;
    while (this.waiters.length) {
      const w = this.waiters.shift();
      w?.reject(err ?? new ImapError('IMAP connection closed', 'aborted'));
    }
    try {
      this.socket?.destroy();
    } catch {
      // ignore
    }
    this.socket = null;
  }

  private nextTag(): string {
    this.tagSeq += 1;
    return `C${this.tagSeq}`;
  }

  private write(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.closed) {
        reject(new ImapError('IMAP not connected', 'connect_failed'));
        return;
      }
      this.socket.write(data, (err) => (err ? reject(err) : resolve()));
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    this.flushLines();
  }

  private onClose(): void {
    this.closed = true;
    while (this.waiters.length) {
      const w = this.waiters.shift();
      w?.reject(new ImapError('IMAP connection closed', 'aborted'));
    }
  }

  private flushLines(): void {
    for (;;) {
      // Literal: `{N}\r\n` then N bytes
      const litMatch = this.buffer.match(/^([^\r\n]*\{(\d+)\})\r\n/);
      if (litMatch) {
        const nbytes = Number(litMatch[2]);
        const headerLen = litMatch[0].length;
        if (this.buffer.length < headerLen + nbytes) return;
        const literal = this.buffer.slice(headerLen, headerLen + nbytes);
        const prefix = litMatch[1]!;
        // Replace literal with a placeholder line the tagged reader can collect
        const placeholder = `${prefix}\0LIT:${nbytes}\0${literal}`;
        this.buffer = placeholder + '\r\n' + this.buffer.slice(headerLen + nbytes);
      }
      const idx = this.buffer.indexOf('\r\n');
      if (idx < 0) return;
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(line);
    }
  }

  private readLine(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new ImapError('IMAP connection closed', 'aborted'));
        return;
      }
      this.waiters.push({ resolve, reject });
      this.flushLines();
    });
  }

  private async readUntilTagged(tag: string): Promise<{
    ok: boolean;
    untagged: string[];
    literals: string[];
  }> {
    const untagged: string[] = [];
    const literals: string[] = [];
    for (;;) {
      const line = await this.readLine();
      const litParts = line.split('\0LIT:');
      if (litParts.length > 1) {
        // line like: `* 1 FETCH (BODY[TEXT]<0.100> {100}\0LIT:100\0actual...`
        const rebuilt: string[] = [litParts[0]!];
        for (let i = 1; i < litParts.length; i++) {
          const rest = litParts[i]!;
          const nullIdx = rest.indexOf('\0');
          if (nullIdx < 0) {
            rebuilt.push(rest);
            continue;
          }
          const nbytes = Number(rest.slice(0, nullIdx));
          const lit = rest.slice(nullIdx + 1, nullIdx + 1 + nbytes);
          literals.push(lit);
          rebuilt.push(`{${nbytes}}`);
          rebuilt.push(rest.slice(nullIdx + 1 + nbytes));
        }
        const joined = rebuilt.join('');
        if (joined.startsWith('*')) untagged.push(joined);
        else if (joined.startsWith(tag + ' ')) {
          return { ok: /\bOK\b/i.test(joined), untagged, literals };
        }
        continue;
      }
      if (line.startsWith('*')) {
        untagged.push(line);
        continue;
      }
      if (line.startsWith('+')) continue;
      if (line.startsWith(tag + ' ')) {
        return { ok: /\bOK\b/i.test(line), untagged, literals };
      }
    }
  }
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parseFetchResponses(untagged: string[], literals: string[]): EmailMessage[] {
  const messages: EmailMessage[] = [];
  let litIdx = 0;
  // Group FETCH lines that may span (we flattened literals into the line already as {N}).
  for (const line of untagged) {
    if (!/\bFETCH\b/i.test(line)) continue;
    const uidMatch = line.match(/\bUID\s+(\d+)/i);
    const uid = uidMatch ? Number(uidMatch[1]) : 0;
    const flagsMatch = line.match(/\bFLAGS\s+\(([^)]*)\)/i);
    const flags = flagsMatch
      ? flagsMatch[1]!.split(/\s+/).map((f) => f.trim()).filter(Boolean)
      : [];
    const unseen = !flags.some((f) => f.toUpperCase() === '\\SEEN');

    let envelopeRaw = '';
    const envIdx = line.search(/\bENVELOPE\s+/i);
    if (envIdx >= 0) {
      const after = line.slice(envIdx + 'ENVELOPE'.length).trimStart();
      envelopeRaw = extractList(after) ?? '';
    }
    const env = parseEnvelope(envelopeRaw);

    // Consume literals in order for BODY sections
    let headers = '';
    let text = '';
    // Count how many {N} appear on this FETCH line — each corresponds to a literal we collected
    const litCounts = line.match(/\{(\d+)\}/g) ?? [];
    for (let i = 0; i < litCounts.length; i++) {
      const lit = literals[litIdx++] ?? '';
      // Heuristic: header fields start with known header names; else treat as text
      if (/^(Subject|From|To|Date|Message-Id|Return-Path|Received|Content-)/im.test(lit) || lit.includes('\nFrom:') || lit.includes('\nSubject:')) {
        headers = lit;
      } else if (!text) {
        text = lit;
      } else {
        headers = headers || lit;
      }
    }

    const subjectFromHeaders = headerValue(headers, 'Subject');
    const fromFromHeaders = headerValue(headers, 'From');
    const toFromHeaders = headerValue(headers, 'To');
    const dateFromHeaders = headerValue(headers, 'Date');
    const midFromHeaders = headerValue(headers, 'Message-Id') || headerValue(headers, 'Message-ID');

    const subject = decodeMimeWords(env.subject || subjectFromHeaders || '(no subject)');
    const from = env.from || fromFromHeaders || '';
    const to = env.to || toFromHeaders || '';
    const date = env.date || dateFromHeaders || '';
    const messageId = env.messageId || midFromHeaders || '';
    const cleanedText = stripQuotedPrintableLite(text).replace(/\r\n/g, '\n').trim();
    const snippet = cleanedText.slice(0, SNIPPET_MAX).replace(/\s+/g, ' ').trim();

    messages.push({
      uid,
      flags,
      unseen,
      date,
      subject,
      from,
      to,
      messageId,
      snippet,
      text: cleanedText,
      headers,
    });
  }
  return messages.filter((m) => m.uid > 0);
}

/** Extract a balanced IMAP parenthesized list starting at s[0] === '('. */
function extractList(s: string): string | null {
  if (!s.startsWith('(')) return null;
  let depth = 0;
  let inQuote = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inQuote) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inQuote = false;
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return null;
}

function parseEnvelope(raw: string): {
  date: string;
  subject: string;
  from: string;
  to: string;
  messageId: string;
} {
  const empty = { date: '', subject: '', from: '', to: '', messageId: '' };
  if (!raw.startsWith('(')) return empty;
  try {
    const tokens = tokenizeList(raw);
    // ENVELOPE: date subject from sender reply-to to cc bcc in-reply-to message-id
    const date = atomString(tokens[0]);
    const subject = atomString(tokens[1]);
    const from = formatAddressList(tokens[2]);
    const to = formatAddressList(tokens[5]);
    const messageId = atomString(tokens[9]);
    return { date, subject, from, to, messageId };
  } catch {
    return empty;
  }
}

type ImapToken = string | null | ImapToken[];

function tokenizeList(raw: string): ImapToken[] {
  const inner = raw.startsWith('(') && raw.endsWith(')') ? raw.slice(1, -1) : raw;
  const tokens: ImapToken[] = [];
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /\s/.test(inner[i]!)) i++;
    if (i >= inner.length) break;
    if (inner.startsWith('NIL', i) && (i + 3 === inner.length || /[\s)]/.test(inner[i + 3]!))) {
      tokens.push(null);
      i += 3;
      continue;
    }
    if (inner[i] === '"') {
      let j = i + 1;
      let out = '';
      while (j < inner.length) {
        if (inner[j] === '\\' && j + 1 < inner.length) {
          out += inner[j + 1];
          j += 2;
          continue;
        }
        if (inner[j] === '"') break;
        out += inner[j];
        j++;
      }
      tokens.push(out);
      i = j + 1;
      continue;
    }
    if (inner[i] === '(') {
      const list = extractList(inner.slice(i));
      if (!list) throw new Error('unbalanced');
      tokens.push(tokenizeList(list));
      i += list.length;
      continue;
    }
    // atom
    let j = i;
    while (j < inner.length && !/[\s()]/.test(inner[j]!)) j++;
    tokens.push(inner.slice(i, j));
    i = j;
  }
  return tokens;
}

function atomString(token: ImapToken | undefined): string {
  if (token == null) return '';
  if (typeof token === 'string') return token;
  return '';
}

function formatAddressList(token: ImapToken | undefined): string {
  if (!token || !Array.isArray(token)) return '';
  const parts: string[] = [];
  for (const addr of token) {
    if (!Array.isArray(addr)) continue;
    // (name route mailbox host)
    const name = atomString(addr[0]);
    const mailbox = atomString(addr[2]);
    const host = atomString(addr[3]);
    const email = mailbox && host ? `${mailbox}@${host}` : mailbox || host;
    if (name && email) parts.push(`${name} <${email}>`);
    else if (email) parts.push(email);
    else if (name) parts.push(name);
  }
  return parts.join(', ');
}

function headerValue(headers: string, name: string): string {
  if (!headers) return '';
  const re = new RegExp(`^${name}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, 'im');
  const m = headers.match(re);
  if (!m) return '';
  return m[1]!.replace(/\r?\n[ \t]+/g, ' ').trim();
}

function decodeMimeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g, (_all, _charset, enc, data: string) => {
    try {
      if (String(enc).toUpperCase() === 'B') {
        return Buffer.from(data, 'base64').toString('utf8');
      }
      // quoted-printable in MIME word
      const qp = data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      return qp;
    } catch {
      return value;
    }
  });
}

function stripQuotedPrintableLite(text: string): string {
  if (!/=[0-9A-Fa-f]{2}/.test(text) && !text.includes('=\r\n') && !text.includes('=\n')) {
    return text;
  }
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Convenience: list recent messages (newest first). */
export async function listRecentMessages(
  config: EmailConfig,
  limit: number,
  options?: { signal?: AbortSignal; timeoutMs?: number; unseenOnly?: boolean }
): Promise<EmailMessage[]> {
  return ImapClient.withSession(
    config,
    async (client) => {
      const uids = await client.uidSearch(options?.unseenOnly ? 'UNSEEN' : 'ALL');
      if (uids.length === 0) return [];
      const slice = uids.slice(-Math.max(1, Math.min(limit, 50)));
      const metas = await client.fetchMeta(slice);
      return metas.sort((a, b) => b.uid - a.uid);
    },
    options
  );
}

export async function fetchOneMessage(
  config: EmailConfig,
  uid: number,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<EmailMessage | null> {
  return ImapClient.withSession(config, (client) => client.fetchMessage(uid), options);
}

export function assertEmailConfig(value: unknown): EmailConfig {
  if (!value || typeof value !== 'object') {
    throw new ImapError('Email IMAP is not configured', 'not_configured');
  }
  const v = value as Record<string, unknown>;
  const host = typeof v.host === 'string' ? v.host.trim() : '';
  const user = typeof v.user === 'string' ? v.user.trim() : '';
  const password = typeof v.password === 'string' ? v.password : '';
  const port = typeof v.port === 'number' ? v.port : Number(v.port);
  const tls = v.tls !== false;
  if (!host || !user || !password || !Number.isFinite(port) || port <= 0) {
    throw new ImapError('Email IMAP config is incomplete (need host, port, user, password)', 'not_configured');
  }
  return { host, port, user, password, tls };
}
