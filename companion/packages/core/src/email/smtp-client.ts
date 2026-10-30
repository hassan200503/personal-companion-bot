/**
 * Minimal SMTP client over Node tls/net (AUTH LOGIN + DATA).
 * Uses the same app-password as IMAP. Derives smtp host when not set.
 */

import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { ImapError, type EmailConfig } from './imap-client.js';

export interface SmtpSendInput {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export interface SmtpSendResult {
  sent: boolean;
  error?: string;
  response?: string;
}

type Conn = Socket | TLSSocket;

const DEFAULT_TIMEOUT_MS = 45_000;

/** Map common IMAP hosts to SMTP submission hosts. */
export function deriveSmtpHost(imapHost: string): { host: string; port: number } {
  const h = imapHost.trim().toLowerCase();
  if (h.includes('gmail') || h === 'imap.gmail.com') return { host: 'smtp.gmail.com', port: 465 };
  if (h.includes('outlook') || h.includes('office365') || h.includes('hotmail')) {
    return { host: 'smtp.office365.com', port: 587 };
  }
  if (h.startsWith('imap.')) return { host: `smtp.${h.slice(5)}`, port: 465 };
  return { host: h, port: 465 };
}

function encodeLogin(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function quoteAddress(addr: string): string {
  const t = addr.trim();
  if (t.includes('<') && t.includes('>')) return t;
  return `<${t}>`;
}

function buildMime(from: string, to: string, subject: string, body: string): string {
  const safeSubject = subject.replace(/[\r\n]+/g, ' ').slice(0, 200);
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body.replace(/\r?\n/g, '\r\n'),
  ];
  // Dot-stuffing for DATA payload
  return lines
    .join('\r\n')
    .replace(/^\./gm, '..')
    .concat('\r\n.\r\n');
}

export class SmtpClient {
  private socket: Conn | null = null;
  private buffer = '';
  private readonly waiters: Array<{
    resolve: (line: string) => void;
    reject: (err: Error) => void;
  }> = [];
  private closed = false;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly user: string,
    private readonly password: string,
    private readonly implicitTls: boolean
  ) {}

  static async send(
    config: EmailConfig,
    input: SmtpSendInput,
    options?: { signal?: AbortSignal; timeoutMs?: number; smtpHost?: string; smtpPort?: number }
  ): Promise<SmtpSendResult> {
    if (options?.signal?.aborted) {
      return { sent: false, error: 'aborted' };
    }
    const derived = deriveSmtpHost(config.host);
    const host = options?.smtpHost?.trim() || derived.host;
    const port = options?.smtpPort && options.smtpPort > 0 ? options.smtpPort : derived.port;
    const implicitTls = port === 465;
    const client = new SmtpClient(host, port, config.user, config.password, implicitTls);
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      await client.connect(timeoutMs);
      await client.handshake(implicitTls, timeoutMs);
      await client.auth(timeoutMs);
      const from = input.from?.trim() || config.user;
      const result = await client.mail(from, input.to, input.subject, input.body, timeoutMs);
      await client.quit();
      return result;
    } catch (error) {
      client.dispose();
      if (error instanceof ImapError) {
        return { sent: false, error: error.code };
      }
      return {
        sent: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      client.dispose();
    }
  }

  private connect(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.dispose();
        reject(new ImapError(err.message || 'SMTP connect failed', 'connect_failed'));
      };
      const onConnect = () => {
        this.socket?.off('error', onError);
        this.socket?.on('data', (chunk: Buffer) => this.onData(chunk));
        this.socket?.on('error', (err) => this.failWaiters(err));
        this.socket?.on('close', () => {
          this.closed = true;
          this.failWaiters(new ImapError('SMTP connection closed', 'connect_failed'));
        });
        resolve();
      };
      const timer = setTimeout(() => {
        this.dispose();
        reject(new ImapError('SMTP connect timed out', 'timeout'));
      }, timeoutMs);
      timer.unref();
      try {
        if (this.implicitTls) {
          this.socket = tlsConnect({ host: this.host, port: this.port, servername: this.host }, () => {
            clearTimeout(timer);
            onConnect();
          });
        } else {
          this.socket = netConnect({ host: this.host, port: this.port }, () => {
            clearTimeout(timer);
            onConnect();
          });
        }
        this.socket.once('error', (err) => {
          clearTimeout(timer);
          onError(err);
        });
      } catch (error) {
        clearTimeout(timer);
        reject(
          new ImapError(
            error instanceof Error ? error.message : String(error),
            'connect_failed'
          )
        );
      }
    });
  }

  private async handshake(implicitTls: boolean, timeoutMs: number): Promise<void> {
    await this.readReply(timeoutMs, ['220']);
    await this.writeLine('EHLO companion.local');
    await this.readReply(timeoutMs, ['250']);
    if (!implicitTls) {
      await this.writeLine('STARTTLS');
      await this.readReply(timeoutMs, ['220']);
      await this.upgradeTls();
      await this.writeLine('EHLO companion.local');
      await this.readReply(timeoutMs, ['250']);
    }
  }

  private upgradeTls(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new ImapError('No socket for STARTTLS', 'connect_failed'));
        return;
      }
      const plain = this.socket as Socket;
      plain.removeAllListeners('data');
      const secure = tlsConnect({ socket: plain, servername: this.host }, () => {
        this.socket = secure;
        this.buffer = '';
        secure.on('data', (chunk: Buffer) => this.onData(chunk));
        secure.on('error', (err) => this.failWaiters(err));
        resolve();
      });
      secure.once('error', (err) => reject(new ImapError(err.message, 'connect_failed')));
    });
  }

  private async auth(timeoutMs: number): Promise<void> {
    await this.writeLine('AUTH LOGIN');
    await this.readReply(timeoutMs, ['334']);
    await this.writeLine(encodeLogin(this.user));
    await this.readReply(timeoutMs, ['334']);
    await this.writeLine(encodeLogin(this.password));
    const reply = await this.readReply(timeoutMs, ['235', '535']);
    if (!reply.startsWith('235')) {
      throw new ImapError('SMTP authentication failed', 'auth_failed');
    }
  }

  private async mail(
    from: string,
    to: string,
    subject: string,
    body: string,
    timeoutMs: number
  ): Promise<SmtpSendResult> {
    await this.writeLine(`MAIL FROM:${quoteAddress(from)}`);
    await this.readReply(timeoutMs, ['250']);
    await this.writeLine(`RCPT TO:${quoteAddress(to)}`);
    await this.readReply(timeoutMs, ['250', '251']);
    await this.writeLine('DATA');
    await this.readReply(timeoutMs, ['354']);
    await this.writeRaw(buildMime(from, to, subject, body));
    const done = await this.readReply(timeoutMs, ['250']);
    return { sent: true, response: done };
  }

  private async quit(): Promise<void> {
    try {
      await this.writeLine('QUIT');
      await this.readReply(5_000, ['221']);
    } catch {
      // best-effort
    }
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    this.flushReplies();
  }

  private flushReplies(): void {
    while (this.waiters.length > 0) {
      const complete = this.extractCompleteReply();
      if (!complete) return;
      const waiter = this.waiters.shift();
      waiter?.resolve(complete);
    }
  }

  private extractCompleteReply(): string | null {
    // Multi-line SMTP replies: "250-..." then final "250 ..."
    const lines = this.buffer.split(/\r?\n/);
    if (lines.length < 2 && !this.buffer.includes('\n')) return null;
    let end = -1;
    let acc = '';
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      if (line === undefined) continue;
      acc += (acc ? '\n' : '') + line;
      if (/^\d{3} /.test(line)) {
        end = i;
        break;
      }
    }
    if (end < 0) return null;
    const consumed = lines.slice(0, end + 1).join('\n').length + 1;
    this.buffer = this.buffer.slice(consumed);
    return acc;
  }

  private readReply(timeoutMs: number, okCodes: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new ImapError('SMTP connection closed', 'connect_failed'));
        return;
      }
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(entry);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new ImapError('SMTP timed out', 'timeout'));
      }, timeoutMs);
      timer.unref();
      const entry = {
        resolve: (line: string) => {
          clearTimeout(timer);
          const code = line.slice(0, 3);
          if (okCodes.some((c) => code === c || line.startsWith(c))) resolve(line);
          else reject(new ImapError(`SMTP unexpected reply: ${line.slice(0, 120)}`, 'command_failed'));
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      };
      this.waiters.push(entry);
      this.flushReplies();
    });
  }

  private writeLine(line: string): Promise<void> {
    return this.writeRaw(`${line}\r\n`);
  }

  private writeRaw(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.closed) {
        reject(new ImapError('SMTP socket unavailable', 'connect_failed'));
        return;
      }
      this.socket.write(data, (err) => (err ? reject(err) : resolve()));
    });
  }

  private failWaiters(err: Error): void {
    while (this.waiters.length) {
      this.waiters.shift()?.reject(err);
    }
  }

  dispose(): void {
    this.closed = true;
    this.failWaiters(new ImapError('SMTP disposed', 'connect_failed'));
    try {
      this.socket?.destroy();
    } catch {
      // ignore
    }
    this.socket = null;
  }
}
