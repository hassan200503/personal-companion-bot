import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openCompanionDatabase } from '../storage/database.js';
import type { CompanionDatabase } from '../storage/database.js';
import type { ToolDefinition, ToolExecutionContext } from './contracts.js';
import { createTempDir, createTestLogger, FakeKeyProtector, removeTempDir } from '../storage/test-helpers.js';
import { SqliteAuditLogger, InMemoryAuditLogger } from './audit.js';
import { DefaultToolRegistry } from './registry.js';
import { InMemoryConfirmationManager } from './confirmation.js';
import { DefaultToolExecutor } from './executor.js';
import { DefaultPolicyEngine } from './policy.js';
import { createMemoryProposeTool, createDraftCreateTool } from './first-tools.js';
import { SqliteMemoryRepository } from '../memory/repository.js';
import { z } from 'zod';

describe('tool registry and executor', () => {
  let tempDir: string;
  let db: CompanionDatabase;

  beforeEach(async () => {
    tempDir = await createTempDir();
    db = await openCompanionDatabase({ userDataDir: tempDir, keyProtector: new FakeKeyProtector(), logger: createTestLogger().logger });
  });

  afterEach(async () => {
    db?.close();
    await removeTempDir(tempDir);
  });

  it('registers and lists tools', () => {
    const reg = new DefaultToolRegistry();
    reg.register(createDraftCreateTool() as ToolDefinition<unknown, unknown>);
    expect(reg.list().length).toBe(1);
    expect(reg.get('draft.create')?.name).toBe('draft.create');
  });

  it('blocks Class 4 registration', () => {
    const reg = new DefaultToolRegistry();
    const tool = { ...createDraftCreateTool(), riskClass: 4, name: 'evil' } as unknown as ToolDefinition<unknown, unknown>;
    expect(() => reg.register(tool)).toThrow();
  });

  it('denies missing permission', async () => {
    const reg = new DefaultToolRegistry();
    reg.register(createDraftCreateTool() as ToolDefinition<unknown, unknown>);
    const audit = new InMemoryAuditLogger();
    const conf = new InMemoryConfirmationManager();
    const exec = new DefaultToolExecutor(reg, new DefaultPolicyEngine(), conf);
    const ctx: ToolExecutionContext = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(),
      audit,
      confirmation: conf,
      draftStore: { create: () => 'd1', list: () => [] },
      now: () => new Date(),
    };
    const res = await exec.execute({ toolName: 'draft.create', input: { title: 't', content: 'c' }, trust: 'trusted' }, ctx);
    expect(res.status).toBe('denied');
  });
});

describe('policy hardening', () => {
  it('untrusted input elevates confirmation for class 2 tool', async () => {
    const { DefaultToolRegistry } = await import('./registry.js');
    const { DefaultPolicyEngine } = await import('./policy.js');
    const reg = new DefaultToolRegistry();
    const tool: ToolDefinition<unknown, unknown> = {
      name: 'mem.propose2',
      version: '1.0.0',
      description: 'propose',
      inputSchema: (await import('zod')).z.object({ x: (await import('zod')).z.string() }),
      outputSchema: (await import('zod')).z.object({ ok: (await import('zod')).z.boolean() }),
      requiredPermissions: [],
      dataClassification: 'personal',
      riskClass: 2,
      reversible: false,
      timeoutMs: 1000,
      cancellable: false,
      audit: 'metadata',
      platforms: ['all'],
      execute: async () => ({ ok: true }),
    };
    reg.register(tool);
    const engine = new DefaultPolicyEngine();
    const { InMemoryConfirmationManager } = await import('./confirmation.js');
    const conf = new InMemoryConfirmationManager();
    const t = reg.get('mem.propose2')!;
    const ctx: Omit<ToolExecutionContext, 'audit' | 'confirmation'> = { signal: new AbortController().signal, platform: process.platform, permissions: new Set(), now: () => new Date() };
    const decision = engine.evaluate({ toolName: 'mem.propose2', input: { x: 'y' }, trust: 'untrusted' }, t, { ...ctx, audit: { record() {}, list() { return []; } }, confirmation: conf });
    expect(decision.requiresConfirmation).toBe(true);
  });
});

describe('tool executor more', () => {
  let tempDir: string;
  let db: CompanionDatabase;
  beforeEach(async () => {
    tempDir = await createTempDir();
    db = await openCompanionDatabase({ userDataDir: tempDir, keyProtector: new FakeKeyProtector(), logger: createTestLogger().logger });
  });
  afterEach(async () => { db?.close(); await removeTempDir(tempDir); });

  it('executes draft.create with permission', async () => {
    const reg = new DefaultToolRegistry();
    reg.register(createDraftCreateTool() as ToolDefinition<unknown, unknown>);
    const audit = new InMemoryAuditLogger();
    const conf = new InMemoryConfirmationManager();
    const exec = new DefaultToolExecutor(reg, new DefaultPolicyEngine(), conf);
    const store: { created: { id: string; title: string; content: string }[]; create(title: string, content: string): string; list(): { id: string; title: string; content: string }[] } = { created: [], create(title, content) { const id = 'd-' + this.created.length; this.created.push({ id, title, content }); return id; }, list() { return this.created; } };
    const ctx: ToolExecutionContext = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(['drafts.write']),
      audit,
      confirmation: conf,
      draftStore: store,
      now: () => new Date(),
    };
    const res = await exec.execute({ toolName: 'draft.create', input: { title: 't', content: 'c' }, trust: 'trusted' }, ctx);
    expect(res.status).toBe('completed');
    expect((res.result as { id: string }).id).toBe('d-0');
  });

  it('memory.propose creates proposed memory', async () => {
    const repo = new SqliteMemoryRepository(db.raw);
    const reg = new DefaultToolRegistry();
    reg.register(createMemoryProposeTool() as ToolDefinition<unknown, unknown>);
    const audit = new InMemoryAuditLogger();
    const conf = new InMemoryConfirmationManager();
    const exec = new DefaultToolExecutor(reg, new DefaultPolicyEngine(), conf);
    const ctx: ToolExecutionContext = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(['memory.write']),
      audit,
      confirmation: conf,
      memoryRepository: repo,
      now: () => new Date(),
    };
    const res = await exec.execute({ toolName: 'memory.propose', input: { category: 'fact', content: 'likes tea' }, trust: 'trusted' }, ctx);
    expect(res.status).toBe('completed');
    const mem = repo.getById((res.result as { id: string }).id);
    expect(mem?.approval).toBe('proposed');
  });

  it('confirmation flow for Class 3 tool', async () => {
    const reg = new DefaultToolRegistry();
    const tool = {
      name: 'fake.send',
      version: '1.0.0',
      description: 'send',
      inputSchema: z.object({ msg: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      requiredPermissions: ['send'],
      dataClassification: 'personal' as const,
      riskClass: 3 as const,
      reversible: false,
      timeoutMs: 1000,
      cancellable: false,
      audit: 'metadata' as const,
      platforms: ['all'] as const,
      execute: async () => ({ ok: true }),
    };
    reg.register(tool as unknown as ToolDefinition<unknown, unknown>);
    const audit = new InMemoryAuditLogger();
    const conf = new InMemoryConfirmationManager();
    const exec = new DefaultToolExecutor(reg, new DefaultPolicyEngine(), conf);
    const ctx: ToolExecutionContext = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(['send']),
      audit,
      confirmation: conf,
      now: () => new Date(),
    };
    const first = await exec.execute({ toolName: 'fake.send', input: { msg: 'hi' }, trust: 'trusted' }, ctx);
    expect(first.status).toBe('needs_confirmation');
    const hash = first.actionHash!;
    expect(conf.confirm(hash)).toBe(true);
    const second = await exec.execute({ toolName: 'fake.send', input: { msg: 'hi' }, trust: 'trusted', confirmationHash: hash }, ctx);
    expect(second.status).toBe('completed');
    const third = await exec.execute({ toolName: 'fake.send', input: { msg: 'hi' }, trust: 'trusted', confirmationHash: hash }, ctx);
    expect(third.status).toBe('duplicate');
  });

  it('audit logger persists to sqlite', () => {
    const audit = new SqliteAuditLogger(db.raw);
    audit.record({ action: 'tool:x', outcome: 'completed', createdAt: new Date().toISOString() });
    expect(audit.list().length).toBe(1);
  });
});









