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
  it('untrusted input never grants intent for a class 2 tool', async () => {
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
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('untrusted_content_cannot_grant_intent');
  });

  it('denies a class 1 tool while the screen is locked', async () => {
    const { DefaultToolRegistry } = await import('./registry.js');
    const { DefaultPolicyEngine } = await import('./policy.js');
    const reg = new DefaultToolRegistry();
    const tool: ToolDefinition<unknown, unknown> = {
      name: 'open.safe',
      version: '1.0.0',
      description: 'open',
      inputSchema: (await import('zod')).z.object({ target: (await import('zod')).z.string() }),
      outputSchema: (await import('zod')).z.object({ ok: (await import('zod')).z.boolean() }),
      requiredPermissions: [],
      dataClassification: 'personal',
      riskClass: 1,
      reversible: true,
      timeoutMs: 1000,
      cancellable: false,
      audit: 'metadata',
      platforms: ['all'],
      execute: async () => ({ ok: true }),
    };
    reg.register(tool);
    const { InMemoryConfirmationManager } = await import('./confirmation.js');
    const conf = new InMemoryConfirmationManager();
    const engine = new DefaultPolicyEngine();
    const t = reg.get('open.safe')!;
    const ctx: ToolExecutionContext = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(),
      audit: { record() {}, list() { return []; } },
      confirmation: conf,
      now: () => new Date(),
      environment: { screenLocked: true, secureDesktop: false }
    };
    const decision = engine.evaluate({ toolName: 'open.safe', input: { target: 'notepad' }, trust: 'trusted' }, t, ctx);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('screen_locked');
  });

  it('denies a tool targeting a password manager', async () => {
    const { DefaultToolRegistry } = await import('./registry.js');
    const { DefaultPolicyEngine } = await import('./policy.js');
    const reg = new DefaultToolRegistry();
    const tool: ToolDefinition<unknown, unknown> = {
      name: 'open.any',
      version: '1.0.0',
      description: 'open',
      inputSchema: (await import('zod')).z.object({ target: (await import('zod')).z.string() }),
      outputSchema: (await import('zod')).z.object({ ok: (await import('zod')).z.boolean() }),
      requiredPermissions: [],
      dataClassification: 'personal',
      riskClass: 2,
      reversible: true,
      timeoutMs: 1000,
      cancellable: false,
      audit: 'metadata',
      platforms: ['all'],
      execute: async () => ({ ok: true }),
    };
    reg.register(tool);
    const { InMemoryConfirmationManager } = await import('./confirmation.js');
    const conf = new InMemoryConfirmationManager();
    const engine = new DefaultPolicyEngine();
    const t = reg.get('open.any')!;
    const ctx: ToolExecutionContext = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(),
      audit: { record() {}, list() { return []; } },
      confirmation: conf,
      now: () => new Date(),
      environment: { screenLocked: false, secureDesktop: false }
    };
    const decision = engine.evaluate({ toolName: 'open.any', input: { target: 'KeePassXC' }, trust: 'trusted' }, t, ctx);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('sensitive_target');
  });

  it('fails closed when a class 2 OS tool has no environment snapshot', async () => {
    const { DefaultToolRegistry } = await import('./registry.js');
    const { DefaultPolicyEngine } = await import('./policy.js');
    const reg = new DefaultToolRegistry();
    const tool: ToolDefinition<unknown, unknown> = {
      name: 'os.open',
      version: '1.0.0',
      description: 'open',
      inputSchema: (await import('zod')).z.object({ target: (await import('zod')).z.string() }),
      outputSchema: (await import('zod')).z.object({ ok: (await import('zod')).z.boolean() }),
      requiredPermissions: [],
      dataClassification: 'personal',
      riskClass: 2,
      reversible: true,
      timeoutMs: 1000,
      cancellable: false,
      audit: 'metadata',
      platforms: ['all'],
      execute: async () => ({ ok: true }),
    };
    reg.register(tool);
    const { InMemoryConfirmationManager } = await import('./confirmation.js');
    const conf = new InMemoryConfirmationManager();
    const engine = new DefaultPolicyEngine();
    const t = reg.get('os.open')!;
    const ctx: ToolExecutionContext = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(),
      audit: { record() {}, list() { return []; } },
      confirmation: conf,
      now: () => new Date()
    };
    const decision = engine.evaluate({ toolName: 'os.open', input: { target: 'notepad' }, trust: 'trusted' }, t, ctx);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('security_probe_failed');
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
      environment: { screenLocked: false, secureDesktop: false }
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

  it('rejects a confirmation hash that was issued for different input', async () => {
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
      environment: { screenLocked: false, secureDesktop: false }
    };
    const first = await exec.execute({ toolName: 'fake.send', input: { msg: 'hi' }, trust: 'trusted' }, ctx);
    const hash = first.actionHash!;
    expect(conf.confirm(hash)).toBe(true);
    const swapped = await exec.execute(
      { toolName: 'fake.send', input: { msg: 'different' }, trust: 'trusted', confirmationHash: hash },
      ctx
    );
    expect(swapped.status).toBe('denied');
    expect(swapped.error).toBe('confirmation_mismatch');
  });

  it('audit logger persists to sqlite', () => {
    const audit = new SqliteAuditLogger(db.raw);
    audit.record({ action: 'tool:x', outcome: 'completed', createdAt: new Date().toISOString() });
    expect(audit.list().length).toBe(1);
  });

  it('does not report completion when a declared postcondition is false', async () => {
    const reg = new DefaultToolRegistry();
    const tool = {
      name: 'fake.observed', version: '1.0.0', description: 'observed', inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }),
      requiredPermissions: [], dataClassification: 'personal' as const, riskClass: 1 as const, reversible: true, timeoutMs: 1000,
      cancellable: false, audit: 'metadata' as const, platforms: ['all'] as const, execute: async () => ({ ok: true }), postcondition: async () => false
    } as unknown as ToolDefinition<unknown, unknown>;
    reg.register(tool);
    const conf = new InMemoryConfirmationManager();
    const exec = new DefaultToolExecutor(reg, new DefaultPolicyEngine(), conf);
    const result = await exec.execute({ toolName: 'fake.observed', input: {}, trust: 'trusted' }, {
      signal: new AbortController().signal, platform: process.platform, permissions: new Set(), audit: new InMemoryAuditLogger(), confirmation: conf, now: () => new Date(),
      environment: { screenLocked: false, secureDesktop: false }
    });
    expect(result.status).toBe('failed');
    expect(result.error).toBe('postcondition_unverified');
  });

  it('requests read-back for voice class-2 actions', async () => {
    const reg = new DefaultToolRegistry();
    const tool = {
      name: 'os.open',
      version: '1.0.0',
      description: 'open',
      inputSchema: z.object({ target: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      requiredPermissions: [],
      dataClassification: 'personal' as const,
      riskClass: 2 as const,
      reversible: true,
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
      permissions: new Set(),
      audit,
      confirmation: conf,
      now: () => new Date(),
      environment: { screenLocked: false, secureDesktop: false }
    };
    const result = await exec.execute({ toolName: 'os.open', input: { target: 'notepad' }, trust: 'trusted', intentSource: 'owner_voice' }, ctx);
    expect(result.status).toBe('needs_read_back');
    expect(result.readBackText).toContain('notepad');
    expect(result.actionHash).toBeDefined();
  });

  it('executes after read-back confirmation', async () => {
    const reg = new DefaultToolRegistry();
    const tool = {
      name: 'os.open',
      version: '1.0.0',
      description: 'open',
      inputSchema: z.object({ target: z.string() }),
      outputSchema: z.object({ ok: z.boolean() }),
      requiredPermissions: [],
      dataClassification: 'personal' as const,
      riskClass: 2 as const,
      reversible: true,
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
      permissions: new Set(),
      audit,
      confirmation: conf,
      now: () => new Date(),
      environment: { screenLocked: false, secureDesktop: false }
    };
    const first = await exec.execute({ toolName: 'os.open', input: { target: 'notepad' }, trust: 'trusted', intentSource: 'owner_voice' }, ctx);
    expect(first.status).toBe('needs_read_back');
    const hash = first.actionHash!;
    conf.confirm(hash);
    const second = await exec.execute({ toolName: 'os.open', input: { target: 'notepad' }, trust: 'trusted', intentSource: 'owner_voice', confirmationHash: hash }, ctx);
    expect(second.status).toBe('completed');
  });
});









