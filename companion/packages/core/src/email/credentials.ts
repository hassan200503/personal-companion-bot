/**
 * IMAP account config in settings + app-password in Keytar.
 * Never stores the password in the SQLite settings blob.
 */

import type { KeytarLike } from '../storage/credentials.js';
import { ImapError, type EmailConfig } from './imap-client.js';

export const EMAIL_SETTINGS_KEY = 'email.imap';
export const EMAIL_KEYTAR_ACCOUNT = 'email/imap';
export const EMAIL_KEYTAR_SERVICE = 'Companion';

export interface EmailAccountPublic {
  host: string;
  port: number;
  user: string;
  tls: boolean;
  configured: boolean;
}

export interface EmailAccountInput {
  host: string;
  port?: number;
  user: string;
  password?: string;
  tls?: boolean;
}

export function normalizeEmailAccountInput(raw: unknown): EmailAccountInput {
  if (!raw || typeof raw !== 'object') {
    throw new ImapError('Email IMAP is not configured', 'not_configured');
  }
  const v = raw as Record<string, unknown>;
  const host = typeof v.host === 'string' ? v.host.trim() : '';
  const user = typeof v.user === 'string' ? v.user.trim() : '';
  const password = typeof v.password === 'string' ? v.password : undefined;
  const portRaw = typeof v.port === 'number' ? v.port : Number(v.port ?? 993);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 993;
  const tls = v.tls !== false;
  if (!host || !user) {
    throw new ImapError('Email IMAP config is incomplete (need host, user)', 'not_configured');
  }
  return { host, port, user, password, tls };
}

export function publicEmailAccount(settings: unknown, hasPassword: boolean): EmailAccountPublic {
  try {
    const n = normalizeEmailAccountInput(settings ?? {});
    return {
      host: n.host,
      port: n.port ?? 993,
      user: n.user,
      tls: n.tls !== false,
      configured: Boolean(n.host && n.user && hasPassword),
    };
  } catch {
    return { host: '', port: 993, user: '', tls: true, configured: false };
  }
}

export async function loadEmailConfig(
  settings: unknown,
  keytar: KeytarLike,
  service = EMAIL_KEYTAR_SERVICE
): Promise<EmailConfig> {
  const n = normalizeEmailAccountInput(settings);
  let password = n.password?.trim() ?? '';
  if (!password) {
    try {
      password = (await keytar.getPassword(service, EMAIL_KEYTAR_ACCOUNT)) ?? '';
    } catch (error) {
      throw new ImapError(
        `Could not read email credentials: ${error instanceof Error ? error.message : String(error)}`,
        'not_configured'
      );
    }
  }
  if (!password) {
    throw new ImapError('Email IMAP password is not stored — connect in Settings first', 'not_configured');
  }
  return {
    host: n.host,
    port: n.port ?? 993,
    user: n.user,
    password,
    tls: n.tls !== false,
  };
}

export async function saveEmailPassword(
  keytar: KeytarLike,
  password: string,
  service = EMAIL_KEYTAR_SERVICE
): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) {
    throw new ImapError('Email password cannot be empty', 'not_configured');
  }
  await keytar.setPassword(service, EMAIL_KEYTAR_ACCOUNT, trimmed);
}

export async function clearEmailPassword(
  keytar: KeytarLike,
  service = EMAIL_KEYTAR_SERVICE
): Promise<void> {
  try {
    await keytar.deletePassword(service, EMAIL_KEYTAR_ACCOUNT);
  } catch {
    // Absent credential is fine.
  }
}

/** Settings blob without password — safe to persist in SQLite. */
export function emailSettingsBlob(input: EmailAccountInput): Record<string, unknown> {
  return {
    host: input.host,
    port: input.port ?? 993,
    user: input.user,
    tls: input.tls !== false,
  };
}
