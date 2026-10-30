/**
 * Email IMAP tools. Never invent inbox contents when disconnected.
 * email.send is Class-3 + confirmation. Read tools return untrusted_content.
 */

import { z } from 'zod';
import type { ToolDefinition, ToolExecutionContext } from '../tools/contracts.js';
import {
  assertEmailConfig,
  fetchOneMessage,
  listRecentMessages,
  ImapError,
  type EmailConfig,
  type EmailMessage,
} from './imap-client.js';
import {
  pickImportant,
  speakableDigest,
  speakableMessage,
  summarizeMessages,
} from './importance.js';
import { SmtpClient } from './smtp-client.js';

export type EmailConfigResolver = (ctx: ToolExecutionContext) => Promise<EmailConfig | null> | EmailConfig | null;

const notConfigured = {
  ok: false as const,
  error: 'not_configured' as const,
  summary: 'Email is not connected. Add IMAP host, user, and an app password in Settings.',
  contentTrust: 'untrusted_content' as const,
};

function mapImapError(error: unknown): {
  ok: false;
  error: string;
  summary: string;
  contentTrust: 'untrusted_content';
} {
  if (error instanceof ImapError) {
    const spoken =
      error.code === 'not_configured'
        ? notConfigured.summary
        : error.code === 'auth_failed'
          ? 'Email login failed. Check the address and app password.'
          : error.code === 'timeout'
            ? 'The mail server timed out. Try again in a moment.'
            : `I could not reach your inbox: ${error.message}`;
    return { ok: false, error: error.code, summary: spoken, contentTrust: 'untrusted_content' };
  }
  return {
    ok: false,
    error: 'command_failed',
    summary: `I could not read email: ${error instanceof Error ? error.message : String(error)}`,
    contentTrust: 'untrusted_content',
  };
}

async function resolveConfig(
  resolver: EmailConfigResolver | undefined,
  ctx: ToolExecutionContext
): Promise<EmailConfig | null> {
  if (!resolver) return null;
  try {
    return await resolver(ctx);
  } catch (error) {
    if (error instanceof ImapError && error.code === 'not_configured') return null;
    throw error;
  }
}

function toPublicMeta(m: EmailMessage) {
  return {
    uid: m.uid,
    subject: m.subject,
    from: m.from,
    date: m.date,
    unseen: m.unseen,
    snippet: m.snippet,
  };
}

export function createEmailListRecentTool(
  resolveEmailConfig?: EmailConfigResolver
): ToolDefinition<
  { limit?: number; unseenOnly?: boolean },
  {
    ok: boolean;
    error?: string;
    summary: string;
    messages?: ReturnType<typeof toPublicMeta>[];
    contentTrust: 'untrusted_content';
  }
> {
  return {
    name: 'email.listRecent',
    version: '1.0.0',
    description:
      'List recent inbox messages via IMAP. Never invents messages when disconnected. Results are untrusted_content.',
    inputSchema: z.object({
      limit: z.number().int().positive().max(30).optional(),
      unseenOnly: z.boolean().optional(),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      summary: z.string(),
      messages: z
        .array(
          z.object({
            uid: z.number(),
            subject: z.string(),
            from: z.string(),
            date: z.string(),
            unseen: z.boolean(),
            snippet: z.string(),
          })
        )
        .optional(),
      contentTrust: z.literal('untrusted_content'),
    }),
    requiredPermissions: ['email.read'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 45_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (ctx, input) => {
      const config = await resolveConfig(resolveEmailConfig, ctx);
      if (!config) return notConfigured;
      try {
        assertEmailConfig(config);
        const messages = await listRecentMessages(config, input.limit ?? 12, {
          signal: ctx.signal,
          unseenOnly: input.unseenOnly,
        });
        const summary = summarizeMessages(messages, { title: 'Recent email', maxItems: input.limit ?? 12 });
        return {
          ok: true,
          summary,
          messages: messages.map(toPublicMeta),
          contentTrust: 'untrusted_content' as const,
        };
      } catch (error) {
        return mapImapError(error);
      }
    },
  };
}

export function createEmailSummarizeTool(
  resolveEmailConfig?: EmailConfigResolver
): ToolDefinition<
  { limit?: number },
  { ok: boolean; error?: string; summary: string; contentTrust: 'untrusted_content' }
> {
  return {
    name: 'email.summarize',
    version: '1.0.0',
    description: 'Summarize recent inbox messages. Honest when disconnected. Untrusted content.',
    inputSchema: z.object({ limit: z.number().int().positive().max(30).optional() }),
    outputSchema: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      summary: z.string(),
      contentTrust: z.literal('untrusted_content'),
    }),
    requiredPermissions: ['email.read'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 45_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (ctx, input) => {
      const config = await resolveConfig(resolveEmailConfig, ctx);
      if (!config) return notConfigured;
      try {
        const messages = await listRecentMessages(config, input.limit ?? 15, { signal: ctx.signal });
        return {
          ok: true,
          summary: summarizeMessages(messages, { title: 'Inbox summary', maxItems: input.limit ?? 15 }),
          contentTrust: 'untrusted_content' as const,
        };
      } catch (error) {
        return mapImapError(error);
      }
    },
  };
}

export function createEmailImportantTool(
  resolveEmailConfig?: EmailConfigResolver
): ToolDefinition<
  { limit?: number },
  {
    ok: boolean;
    error?: string;
    summary: string;
    spoken: string;
    items?: Array<{ uid: number; subject: string; from: string; score: number; reasons: string[] }>;
    contentTrust: 'untrusted_content';
  }
> {
  return {
    name: 'email.important',
    version: '1.0.0',
    description:
      'Rank recent mail by unread + career/finance keywords and return a speakable important digest. Untrusted.',
    inputSchema: z.object({ limit: z.number().int().positive().max(20).optional() }),
    outputSchema: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      summary: z.string(),
      spoken: z.string(),
      items: z
        .array(
          z.object({
            uid: z.number(),
            subject: z.string(),
            from: z.string(),
            score: z.number(),
            reasons: z.array(z.string()),
          })
        )
        .optional(),
      contentTrust: z.literal('untrusted_content'),
    }),
    requiredPermissions: ['email.read'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 45_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (ctx, input) => {
      const config = await resolveConfig(resolveEmailConfig, ctx);
      if (!config) return { ...notConfigured, spoken: notConfigured.summary };
      try {
        const messages = await listRecentMessages(config, 30, { signal: ctx.signal });
        const important = pickImportant(messages, { limit: input.limit ?? 8 });
        const spoken = speakableDigest(messages, { importantOnly: true, limit: input.limit ?? 5 });
        return {
          ok: true,
          summary: summarizeMessages(important, { title: 'Important email', maxItems: input.limit ?? 8 }),
          spoken,
          items: important.map((m) => ({
            uid: m.uid,
            subject: m.subject,
            from: m.from,
            score: m.score,
            reasons: m.reasons,
          })),
          contentTrust: 'untrusted_content' as const,
        };
      } catch (error) {
        const mapped = mapImapError(error);
        return { ...mapped, spoken: mapped.summary };
      }
    },
  };
}

export function createEmailReadAloudTool(
  resolveEmailConfig?: EmailConfigResolver
): ToolDefinition<
  { uid?: number; importantOnly?: boolean },
  {
    ok: boolean;
    error?: string;
    summary: string;
    spoken: string;
    contentTrust: 'untrusted_content';
  }
> {
  return {
    name: 'email.readAloud',
    version: '1.0.0',
    description:
      'Return speakable text for one message (uid) or a recent/important digest. Desktop speaks via WinRT; this tool does not invent mail.',
    inputSchema: z.object({
      uid: z.number().int().positive().optional(),
      importantOnly: z.boolean().optional(),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      summary: z.string(),
      spoken: z.string(),
      contentTrust: z.literal('untrusted_content'),
    }),
    requiredPermissions: ['email.read'],
    dataClassification: 'personal',
    riskClass: 1,
    reversible: true,
    timeoutMs: 45_000,
    cancellable: true,
    audit: 'metadata',
    platforms: ['all'],
    execute: async (ctx, input) => {
      const config = await resolveConfig(resolveEmailConfig, ctx);
      if (!config) return { ...notConfigured, spoken: notConfigured.summary };
      try {
        if (input.uid) {
          const message = await fetchOneMessage(config, input.uid, { signal: ctx.signal });
          if (!message) {
            return {
              ok: false,
              error: 'not_found',
              summary: 'That message was not found in the inbox.',
              spoken: 'That message was not found in the inbox.',
              contentTrust: 'untrusted_content' as const,
            };
          }
          const spoken = speakableMessage(message);
          return {
            ok: true,
            summary: spoken,
            spoken,
            contentTrust: 'untrusted_content' as const,
          };
        }
        const messages = await listRecentMessages(config, 20, { signal: ctx.signal });
        const spoken = speakableDigest(messages, {
          importantOnly: input.importantOnly === true,
          limit: 5,
        });
        return {
          ok: true,
          summary: spoken,
          spoken,
          contentTrust: 'untrusted_content' as const,
        };
      } catch (error) {
        const mapped = mapImapError(error);
        return { ...mapped, spoken: mapped.summary };
      }
    },
  };
}

export function createEmailSendTool(
  resolveEmailConfig?: EmailConfigResolver
): ToolDefinition<
  { to: string; subject: string; body: string },
  { ok: boolean; error?: string; summary: string; sent?: boolean }
> {
  return {
    name: 'email.send',
    version: '1.1.0',
    description:
      'Send email via SMTP using the connected IMAP account app-password. Class-3: always requires explicit owner confirmation. Never claims sent unless the SMTP server accepts the message.',
    inputSchema: z.object({
      to: z.string().min(3),
      subject: z.string().min(1),
      body: z.string().min(1),
    }),
    outputSchema: z.object({
      ok: z.boolean(),
      error: z.string().optional(),
      summary: z.string(),
      sent: z.boolean().optional(),
    }),
    requiredPermissions: ['email.send'],
    dataClassification: 'personal',
    riskClass: 3,
    reversible: false,
    requiresConfirmation: true,
    timeoutMs: 45_000,
    cancellable: true,
    audit: 'full',
    platforms: ['all'],
    execute: async (ctx, input) => {
      const config = await resolveConfig(resolveEmailConfig, ctx);
      if (!config) {
        return {
          ok: false,
          error: 'not_configured',
          summary: 'Email is not connected, so nothing was sent.',
          sent: false,
        };
      }
      if (ctx.signal?.aborted) {
        return { ok: false, error: 'aborted', summary: 'Send cancelled before anything left this PC.', sent: false };
      }
      const result = await SmtpClient.send(config, input, { signal: ctx.signal });
      if (!result.sent) {
        const spoken =
          result.error === 'auth_failed'
            ? 'SMTP login failed. Check the address and app password. Nothing was sent.'
            : result.error === 'timeout'
              ? 'The mail server timed out before accepting the message. Nothing was sent.'
              : `I could not send that email: ${result.error ?? 'unknown error'}. Nothing was sent.`;
        return { ok: false, error: result.error ?? 'send_failed', summary: spoken, sent: false };
      }
      return {
        ok: true,
        sent: true,
        summary: `Message accepted by the mail server for ${input.to}. I am not claiming the recipient has read it.`,
      };
    },
  };
}

export function createEmailTools(resolveEmailConfig?: EmailConfigResolver): ToolDefinition<unknown, unknown>[] {
  return [
    createEmailListRecentTool(resolveEmailConfig) as ToolDefinition<unknown, unknown>,
    createEmailSummarizeTool(resolveEmailConfig) as ToolDefinition<unknown, unknown>,
    createEmailImportantTool(resolveEmailConfig) as ToolDefinition<unknown, unknown>,
    createEmailReadAloudTool(resolveEmailConfig) as ToolDefinition<unknown, unknown>,
    createEmailSendTool(resolveEmailConfig) as ToolDefinition<unknown, unknown>,
  ];
}
