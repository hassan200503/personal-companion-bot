import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, net, session, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createLogger,
  isStorageError,
  openCompanionDatabase,
  type CompanionDatabase,
  type Logger,
  DefaultOnboardingEngine,
  DefaultStepRegistry,
  DatabaseOnboardingStorage,
  SystemCheckStep,
  PresetChoiceStep,
  DefaultConversationEngine,
  SqliteConversationStore,
  SqliteMemoryRepository,
  createMemoryRetriever,
  createMemoryRecorder,
  DefaultScheduler,
  BoundedReflectionLoop,
  exportAllData,
  deleteAllData,
  backupStatus,
  ProviderRouter,
  getProviderEntry,
  getProviderCatalog,
  discoverProviderModels,
  DefaultOnboardingPipeline,
  createCustomOpenAiProvider,
  encodeCustomProviderId,
  decodeCustomProviderId,
  DefaultToolRegistry,
  DefaultToolExecutor,
  DefaultPolicyEngine,
  InMemoryConfirmationManager,
} from "@companion/core";
import { ipcChannels, type AppInfo } from "../shared/ipc";
import type { ConversationEngine, Scheduler, Conversation, ConversationMessage, CredentialStore } from "@companion/core";
import { createOsControlTools } from "../../../../packages/core/src/os-control/tools.js";
import { createDesktopCredentialStore, createDesktopKeyProtector } from "./storage/adapters";

app.setName("Companion");

// Use Electron's Chromium network stack for provider requests. Node's fetch
// does not consistently honor the Windows/Electron proxy and certificate
// configuration, which can make Google requests hang until AbortSignal.timeout.
function configureProviderNetwork(): void {
  const electronFetch = net.fetch.bind(net) as typeof globalThis.fetch;
  globalThis.fetch = electronFetch;
}

let logger: Logger = createLogger({ level: "info" });
const sessionTokens = new Map<number, string>();
let mainWindow: BrowserWindow | null = null;
let companionDatabase: CompanionDatabase | null = null;
let onboardingEngine: DefaultOnboardingEngine | null = null;
let conversationEngine: ConversationEngine | null = null;
let providerRouter: ProviderRouter | null = null;
let credentialStore: CredentialStore | null = null;
let toolRegistry: DefaultToolRegistry | null = null;
let toolExecutor: DefaultToolExecutor | null = null;
let confirmationManager: InMemoryConfirmationManager | null = null;
let voiceProcess: ChildProcess | null = null;
let defaultModel = '';
let tray: Tray | null = null;
let backgroundScheduler: Scheduler | null = null;
let backgroundPaused = false;

function modelSettingKey(providerId: string): string {
  return 'provider.model.' + providerId;
}

function getSavedProviderModel(providerId: string): string | undefined {
  try {
    const row = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get(modelSettingKey(providerId)) as { value?: string } | undefined;
    return row?.value || undefined;
  } catch {
    return undefined;
  }
}

function saveProviderModel(providerId: string, model: string): void {
  try {
    companionDatabase?.raw.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    ).run(modelSettingKey(providerId), model, new Date().toISOString());
  } catch {
    // Model selection is recoverable; the credential remains in Credential Manager.
  }
}

function deleteSavedProviderModel(providerId: string): void {
  try {
    companionDatabase?.raw.prepare('DELETE FROM settings WHERE key = ?').run(modelSettingKey(providerId));
  } catch {
    // Ignore cleanup failure.
  }
}

function configureFileLogging(): void {
  const logFile = join(app.getPath("userData"), "logs", "companion.log");

  try {
    mkdirSync(dirname(logFile), { recursive: true });
  } catch {
    return;
  }

  logger = createLogger({
    level: "info",
    sink: (line) => {
      console.log(line);

      try {
        appendFileSync(logFile, `${line}\n`, "utf8");
      } catch {
        // Logging must never take down the app.
      }
    }
  });
}

async function openStorage(): Promise<void> {
  try {
    companionDatabase = await openCompanionDatabase({
      userDataDir: app.getPath("userData"),
      keyProtector: createDesktopKeyProtector(),
      logger
    });
    if (companionDatabase) {
      try {
        const registry = new DefaultStepRegistry();
        registry.register(new SystemCheckStep());
        registry.register(new PresetChoiceStep());
        const storage = new DatabaseOnboardingStorage(companionDatabase);
        onboardingEngine = new DefaultOnboardingEngine(registry, storage);
        await onboardingEngine.initialize();

        const memoryRepo = new SqliteMemoryRepository(companionDatabase.raw);
        const convStore = new SqliteConversationStore(companionDatabase.raw);
          credentialStore = createDesktopCredentialStore(logger);
          const router = new ProviderRouter({ maxRetries: 8 });
          providerRouter = router;

          // Load stored provider credentials and register providers.
          try {
            const ids = await credentialStore!.listProviderIds();
            for (const id of ids) {
              const key = await credentialStore!.tryGet(id);
              if (key) {
                const entry = getProviderEntry(id);
                if (entry) {
                  const model = getSavedProviderModel(id) || entry.models[0];
                  router.register(entry.factory(key), 100, model);
                  if (!defaultModel && entry.models.length > 0) {
                    defaultModel = model ?? '';
                  }
                } else {
                  const custom = decodeCustomProviderId(id);
                  if (custom) router.register(createCustomOpenAiProvider(id, custom.name, key, custom.baseUrl), 100, custom.model);
                }
              }
            }
          } catch (e) {
            logger.warn('failed to load stored credentials', { error: String(e) });
          }

          conversationEngine = new DefaultConversationEngine({
            router,
            defaultModel,
            conversationStore: convStore,
            memoryRetriever: createMemoryRetriever(memoryRepo),
            memoryRecorder: createMemoryRecorder(memoryRepo),
          });
           // OS control tools
           try {
             const reg = new DefaultToolRegistry();
             const cm = new InMemoryConfirmationManager();
             for (const t of createOsControlTools()) reg.register(t);
             toolRegistry = reg;
             confirmationManager = cm;
             toolExecutor = new DefaultToolExecutor(reg, new DefaultPolicyEngine(), cm);
           } catch (e) {
             logger.warn('os control init failed', { error: String(e) });
           }
        backgroundScheduler = new DefaultScheduler();
        backgroundScheduler.register({
          id: 'reflection',
          intervalMs: 60_000,
          run: async () => {
            const loop = new BoundedReflectionLoop({ maxIterations: 3, maxDurationMs: 5_000 });
            await loop.run();
          },
        });
        backgroundScheduler.start();
      } catch (e) {
        logger.warn("engine init failed", { error: String(e) });
      }
    }
  } catch (error) {
    logger.error("encrypted storage could not be opened", {
      code: isStorageError(error) ? error.code : "unknown",
      message: String(error)
    });
  }
}

async function checkCredentialStore(): Promise<void> {
  try {
    const store = credentialStore ?? createDesktopCredentialStore(logger);
    credentialStore = store;
    const providerIds = await store.listProviderIds();
    logger.info("credential store available", { providerCount: providerIds.length });
  } catch (error) {
    logger.warn("credential store unavailable", {
      code: isStorageError(error) ? error.code : "unknown"
    });
  }
}

  async function registerProviderKey(providerId: string, apiKey: string, requestedModel?: string): Promise<{ valid: boolean; error?: string; model?: string }> {
    if (!providerRouter || !credentialStore) throw new Error('Storage unavailable');
    const pipeline = new DefaultOnboardingPipeline();
    const validation = await pipeline.validateKey(providerId, apiKey);
    if (!validation.valid) return { valid: false, error: validation.error };
    const entry = getProviderEntry(providerId);
    if (!entry) return { valid: false, error: 'Unknown provider' };
    await credentialStore.set(providerId, apiKey);
    const model = requestedModel?.trim() || entry.models[0];
    providerRouter.register(entry.factory(apiKey), 100, model);
    if (model) saveProviderModel(providerId, model);
    const registeredModels = providerRouter.getProviders().map((registration) => registration.model);
    if ((!defaultModel || !registeredModels.includes(defaultModel)) && entry.models.length > 0) {
      defaultModel = model ?? entry.models[0] ?? '';
      conversationEngine?.setDefaultModel(defaultModel);
    }
    return { valid: true, model: defaultModel };
  }

async function registerCustomProvider(config: { name: string; baseUrl: string; model: string }, apiKey: string): Promise<{ valid: boolean; error?: string; id?: string }> {
  if (!providerRouter || !credentialStore) throw new Error('Storage unavailable');
  const url = new URL(config.baseUrl);
  if (url.protocol !== 'https:') return { valid: false, error: 'Custom provider URL must use HTTPS.' };
  if (!config.name.trim() || !config.model.trim() || !apiKey.trim()) return { valid: false, error: 'Name, model and API key are required.' };
  const id = encodeCustomProviderId({ name: config.name.trim(), baseUrl: url.toString().replace(/\/$/, ''), model: config.model.trim() });
  const provider = createCustomOpenAiProvider(id, config.name.trim(), apiKey.trim(), url.toString().replace(/\/$/, ''));
  const health = await provider.healthCheck();
  if (!health.healthy) return { valid: false, error: health.error?.message || 'Custom provider health check failed.' };
  await credentialStore.set(id, apiKey.trim());
  providerRouter.register(provider, 100, config.model.trim());
  return { valid: true, id };
}


function assertTrustedSender(event: IpcMainInvokeEvent, suppliedToken: unknown): void {
  const expectedToken = sessionTokens.get(event.sender.id);
  const frameUrl = event.senderFrame?.url ?? "";
  const allowedFrame =
    frameUrl.startsWith("file://") || frameUrl.startsWith("http://localhost:5173/");

  if (
    expectedToken === undefined ||
    typeof suppliedToken !== "string" ||
    suppliedToken !== expectedToken ||
    !allowedFrame
  ) {
    throw new Error("Unauthorized IPC call");
  }
}

function registerIpc(): void {
  ipcMain.handle(ipcChannels.appInfo, (event, suppliedToken: unknown): AppInfo => {
    assertTrustedSender(event, suppliedToken);

    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? "unknown",
      platform: process.platform
    };
  });

  ipcMain.handle(ipcChannels.onboardingGetState, async (event, suppliedToken: unknown): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!onboardingEngine) throw new Error("Onboarding unavailable");
    return onboardingEngine.getState();
  });

  ipcMain.handle(ipcChannels.onboardingRun, async (event, suppliedToken: unknown): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!onboardingEngine) throw new Error("Onboarding unavailable");
    const controller = new AbortController();
    const logs: string[] = [];
    await onboardingEngine.run({
      signal: controller.signal,
      log: (m: string) => logs.push(m),
    });
    return { state: await onboardingEngine.getState(), logs };
  });

  ipcMain.handle(ipcChannels.chatListConversations, async (event, suppliedToken: unknown): Promise<unknown[]> => {
    assertTrustedSender(event, suppliedToken);
    if (!conversationEngine) throw new Error("Chat unavailable");
    return conversationEngine.listConversations().map((c: Conversation) => ({
      id: c.id,
      title: c.title,
      messageCount: c.messages.length,
      updatedAt: c.updatedAt,
    }));
  });

  ipcMain.handle(ipcChannels.chatCreateConversation, async (event, suppliedToken: unknown, title?: string): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!conversationEngine) throw new Error("Chat unavailable");
    const c = conversationEngine.createConversation(title);
    return { id: c.id, title: c.title, messageCount: c.messages.length, updatedAt: c.updatedAt };
  });

  ipcMain.handle(ipcChannels.chatGetConversation, async (event, suppliedToken: unknown, id: string): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!conversationEngine) throw new Error("Chat unavailable");
    const c = conversationEngine.getConversation(id);
    if (!c) throw new Error("Not found");
    return {
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messages: c.messages.map((m: ConversationMessage) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt })),
    };
  });

  ipcMain.handle(ipcChannels.chatSendMessage, async (event, suppliedToken: unknown, conversationId: string, content: string): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!conversationEngine) throw new Error("Chat unavailable");
    // Inject memory profile into system prompt
    try {
      const row = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get('memory.profile') as { value?: string } | undefined;
      const profile = row?.value ? JSON.parse(row.value) : {};
      const ownerRow = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get('owner.profile') as { value?: string } | undefined;
      const owner = ownerRow?.value ? JSON.parse(ownerRow.value) : {};
      const base = 'You are Companion, a helpful private assistant.';
      const ownerText = owner?.name ? `\\nOwner name: ${owner.name}. Address the user by name when appropriate.` : '';
      const profileText = Object.keys(profile).length ? `\\nUser profile: ${JSON.stringify(profile)}` : '';
      conversationEngine.setSystemPrompt(base + ownerText + profileText);
    } catch { /* ignore */ }
    const msg = await conversationEngine.sendMessage(conversationId, content, new AbortController().signal);
    // Reflect to update profile (best effort)
    void (async () => {
      try {
        if (!providerRouter || !defaultModel) return;
        const resp = await providerRouter.complete({
          model: defaultModel,
          messages: [
            { role: 'system', content: 'Extract any durable user preferences/facts from this exchange. Return JSON object with keys to update (e.g. {"tone":"concise","interests":["music"]}). If none, return {}.' },
            { role: 'user', content: `User: ${content}\\nAssistant: ${msg.content}` },
          ],
          temperature: 0,
          jsonMode: true,
        }, new AbortController().signal);
        const parsed = JSON.parse(resp.content.trim().replace(/^```json\\s*/i, '').replace(/```$/i, ''));
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
          const row = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get('memory.profile') as { value?: string } | undefined;
          const existing = row?.value ? JSON.parse(row.value) : {};
          const merged = { ...existing, ...parsed };
          companionDatabase?.raw.prepare(
            'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
          ).run('memory.profile', JSON.stringify(merged), new Date().toISOString());
        }
      } catch { /* ignore */ }
    })();
    return { id: msg.id, role: msg.role, content: msg.content, createdAt: msg.createdAt };
  });

    ipcMain.handle(ipcChannels.appOpenExternal, async (event, suppliedToken: unknown, url: string): Promise<void> => {
      assertTrustedSender(event, suppliedToken);
      if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('Invalid URL');
      await shell.openExternal(url);
    });

    ipcMain.handle(ipcChannels.providersCatalog, async (event, suppliedToken: unknown): Promise<unknown> => {
      assertTrustedSender(event, suppliedToken);
      return getProviderCatalog().map((entry) => ({
        id: entry.id,
        displayName: entry.displayName,
        signupUrl: entry.signupUrl,
        keyUrl: entry.keyUrl,
        keyPrefixHint: entry.keyPrefixHint,
        needsPhone: entry.needsPhone,
        needsCard: entry.needsCard,
        regionNotes: entry.regionNotes,
        models: entry.models,
        guideSteps: entry.guideSteps,
        privacyNote: entry.privacyNote,
        pricingNote: entry.pricingNote,
        freeTier: entry.freeTier,
      }));
    });

    ipcMain.handle(ipcChannels.credentialsList, async (event, suppliedToken: unknown): Promise<string[]> => {
      assertTrustedSender(event, suppliedToken);
      if (!credentialStore) throw new Error('Credential store unavailable');
      const activeIds = new Set(getProviderCatalog().map((entry) => entry.id));
      return (await credentialStore.listProviderIds()).filter((id) => activeIds.has(id) || Boolean(decodeCustomProviderId(id)));
    });

    ipcMain.handle(ipcChannels.credentialsValidate, async (event, suppliedToken: unknown, providerId: string, apiKey: string): Promise<unknown> => {
      assertTrustedSender(event, suppliedToken);
      const pipeline = new DefaultOnboardingPipeline();
      return pipeline.validateKey(providerId, apiKey);
    });

    ipcMain.handle(ipcChannels.providersDiscoverModels, async (event, suppliedToken: unknown, providerId: string, apiKey: string): Promise<unknown> => {
      assertTrustedSender(event, suppliedToken);
      return discoverProviderModels(providerId, apiKey);
    });

    ipcMain.handle(ipcChannels.credentialsSet, async (event, suppliedToken: unknown, providerId: string, apiKey: string, model?: string): Promise<unknown> => {
      assertTrustedSender(event, suppliedToken);
      return registerProviderKey(providerId, apiKey, model);
    });

    ipcMain.handle(ipcChannels.credentialsDelete, async (event, suppliedToken: unknown, providerId: string): Promise<unknown> => {
      assertTrustedSender(event, suppliedToken);
      if (!credentialStore || !providerRouter) throw new Error('Storage unavailable');
      await credentialStore.delete(providerId);
      deleteSavedProviderModel(providerId);
      providerRouter.unregister(providerId);
      return { ok: true };
    });

    ipcMain.handle(ipcChannels.providersAddCustom, async (event, suppliedToken: unknown, config: { name: string; baseUrl: string; model: string }, apiKey: string): Promise<unknown> => {
      assertTrustedSender(event, suppliedToken);
      return registerCustomProvider(config, apiKey);
    });


  ipcMain.handle(ipcChannels.privacyExport, async (event, suppliedToken: unknown): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!companionDatabase) throw new Error("Storage unavailable");
    return exportAllData(companionDatabase.raw);
  });

  ipcMain.handle(ipcChannels.privacyDeleteAll, async (event, suppliedToken: unknown): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!companionDatabase) throw new Error("Storage unavailable");
    deleteAllData(companionDatabase.raw);
    return { ok: true };
  });

  ipcMain.handle(ipcChannels.privacyBackupStatus, async (event, suppliedToken: unknown, backupDir?: string): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    return backupStatus(backupDir ?? "");
  });
  // Voice settings
  ipcMain.handle(ipcChannels.voiceGetSettings, (event, suppliedToken: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    try {
      const row = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get('voice.settings') as { value?: string } | undefined;
      return row?.value ? JSON.parse(row.value) : { voice: '', rate: 0 };
    } catch {
      return { voice: '', rate: 0 };
    }
  });

  ipcMain.handle(ipcChannels.voiceSetSettings, (event, suppliedToken: unknown, settings: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    try {
      companionDatabase?.raw.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).run('voice.settings', JSON.stringify(settings ?? {}), new Date().toISOString());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  // Memory profile
  ipcMain.handle(ipcChannels.memoryGetProfile, (event, suppliedToken: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    try {
      const row = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get('memory.profile') as { value?: string } | undefined;
      return row?.value ? JSON.parse(row.value) : {};
    } catch {
      return {};
    }
  });

  ipcMain.handle(ipcChannels.memorySetProfile, (event, suppliedToken: unknown, profile: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    try {
      companionDatabase?.raw.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).run('memory.profile', JSON.stringify(profile ?? {}), new Date().toISOString());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle(ipcChannels.memoryClearProfile, (event, suppliedToken: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    try {
      companionDatabase?.raw.prepare('DELETE FROM settings WHERE key = ?').run('memory.profile');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle(ipcChannels.memoryGetOwner, (event, suppliedToken: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    try {
      const row = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get('owner.profile') as { value?: string } | undefined;
      return row?.value ? JSON.parse(row.value) : {};
    } catch {
      return {};
    }
  });

  ipcMain.handle(ipcChannels.memorySetOwner, (event, suppliedToken: unknown, owner: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    try {
      companionDatabase?.raw.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).run('owner.profile', JSON.stringify(owner ?? {}), new Date().toISOString());
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  // Voice (offline STT via Windows Speech)
  ipcMain.handle(ipcChannels.voiceStart, (event, suppliedToken: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    if (voiceProcess) return { started: true };
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$r = New-Object System.Speech.Recognition.SpeechRecognitionEngine',
      '$r.SetInputToDefaultAudioDevice()',
      '$g = New-Object System.Speech.Recognition.DictationGrammar',
      '$r.LoadGrammar($g)',
      'Write-Host "LISTENING"',
      '[Console]::Out.Flush()',
      'while ($true) {',
      '  try {',
      '    $res = $r.Recognize()',
      '    if ($res -ne $null -and $res.Text) {',
      '      Write-Output ("RECOGNIZED:" + $res.Text)',
      '      [Console]::Out.Flush()',
      '    }',
      '  } catch {',
      '    Start-Sleep -Milliseconds 500',
      '  }',
      '}',
    ].join('\n');
    const scriptPath = join(app.getPath('temp'), 'companion-listen.ps1');
    writeFileSync(scriptPath, script, 'utf8');
    voiceProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
    voiceProcess.stdout?.on('data', (d: Buffer) => {
      const lines = d.toString().split(/\r?\n/);
      for (const line of lines) {
        const m = line.match(/^RECOGNIZED:(.*)$/);
        if (m) {
          const text = (m[1] ?? '').trim();
          if (text) {
            const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
            win?.webContents.send(ipcChannels.voiceTranscript, { text, final: true });
          }
        }
      }
    });
    voiceProcess.on('exit', () => { voiceProcess = null; });
    return { started: true };
  });

  ipcMain.handle(ipcChannels.voiceStop, (event, suppliedToken: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    if (voiceProcess) {
      try { voiceProcess.kill(); } catch { /* ignore */ }
      voiceProcess = null;
    }
    return { stopped: true };
  });

  // OS control
  ipcMain.handle(ipcChannels.osListTools, (event, suppliedToken: unknown): unknown => {
    assertTrustedSender(event, suppliedToken);
    if (!toolRegistry) return [];
    return toolRegistry.list().map((t) => ({ name: t.name, version: t.version, description: t.description, riskClass: t.riskClass, requiresConfirmation: t.requiresConfirmation ?? false }));
  });

  ipcMain.handle(ipcChannels.osExecuteTool, async (event, suppliedToken: unknown, toolName: string, input: unknown, confirmationHash?: string): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!toolExecutor || !confirmationManager) throw new Error('OS control unavailable');
    const ctx = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(['os.open','os.media','os.speak','os.telephony','os.exec','memory.read','memory.write','drafts.write']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audit: { record: () => {}, list: () => [] } as any,
      confirmation: confirmationManager,
      now: () => new Date(),
      logger,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const result = await toolExecutor.execute({ toolName, input, trust: 'trusted', confirmationHash }, ctx);
    return result;
  });

  ipcMain.handle(ipcChannels.osTryCommand, async (event, suppliedToken: unknown, text: string): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!toolExecutor || !toolRegistry) throw new Error('OS control unavailable');
    const trimmed = String(text ?? '').trim();
    const lower = trimmed.toLowerCase();
    let toolName: string | null = null;
    let input: Record<string, unknown> = {};
    // Normalize quotes
    const clean = trimmed.replace(/^["']|["']$/g, '').trim();

    // Memory: remember
    if (lower.startsWith('remember ')) {
      const note = trimmed.slice(9).trim();
      try {
        const row = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get('memory.profile') as { value?: string } | undefined;
        const profile = row?.value ? JSON.parse(row.value) : {};
        const notes = Array.isArray(profile.notes) ? profile.notes : [];
        notes.push({ note, at: new Date().toISOString() });
        profile.notes = notes;
        companionDatabase?.raw.prepare(
          'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
        ).run('memory.profile', JSON.stringify(profile), new Date().toISOString());
      } catch { /* ignore */ }
      return { handled: true, toolName: 'memory.remember', result: { ok: true, note } };
    }
    // Screenshot
    else if (lower.includes('screenshot') || lower.includes('capture screen') || lower.includes('screen capture')) {
      toolName = 'os.screenshot'; input = {};
    }
    // WhatsApp send
    else if (lower.includes('whatsapp') && (lower.includes('send') || lower.includes('message') || lower.includes('tell'))) {
      let message = '';
      const qm = trimmed.match(/["']([^"']+)["']/);
      if (qm) message = qm[1] ?? message;
      let contact = '';
      const cm = trimmed.match(/\bto\s+([A-Za-z0-9 _-]+?)(?:\s+on\s+whatsapp|\s+in\s+whatsapp|\s+via\s+whatsapp|$)/i);
      if (cm) contact = (cm[1] ?? '').trim();
      if (!contact) contact = 'contact';
      if (!message) message = trimmed;
      toolName = 'os.whatsappSend'; input = { contact, message };
    }
    // Photo capture
    else if (lower.includes('photo') || lower.includes('picture') || lower.includes('capture image') || lower.includes('take image')) {
      toolName = 'os.photo'; input = {};
    }
    // Video recording
    else if ((lower.includes('video') || lower.includes('record')) && !lower.includes('play') && !lower.includes('song') && !lower.includes('music')) {
      toolName = 'os.video'; input = { seconds: 5 };
    }
    // Camera open
    else if (lower.includes('camera') || lower.includes('webcam')) {
      toolName = 'os.camera'; input = { mode: lower.includes('video') ? 'video' : 'photo' };
    }
    // Browser / search
    else if (lower.includes('search') || lower.includes('google') || lower.includes('browser') || lower.includes('chrome')) {
      let query = '';
      const qm = trimmed.match(/["']([^"']+)["']/);
      if (qm) query = qm[1] ?? query;
      else {
        const m = trimmed.match(/search\s+(.+)$/i);
        if (m) query = (m[1] ?? '').trim();
        else {
          const m2 = trimmed.match(/(?:browser|chrome)\s+(.+)$/i);
          if (m2) query = (m2[1] ?? '').trim();
        }
      }
      query = query.replace(/\s*(in|on|using)\s+(browser|chrome|google).*$/i, '').trim();
      const url = query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : 'https://www.google.com';
      toolName = 'os.open'; input = { target: url };
    }
    // Open
    else if (lower.startsWith('open ')) {
      // Extract a known alias if present in the phrase.
      const aliases = ['camera','whatsapp','youtube','notepad','calculator','calc','paint','explorer','files','settings','store','browser','edge','chrome','photos'];
      let target = clean.slice(5).trim();
      const foundAlias = aliases.find((a) => target.toLowerCase().includes(a));
      if (foundAlias) target = foundAlias;
      toolName = 'os.open'; input = { target };
    }
    // Play
    else if (lower.startsWith('play ')) {
      let target = clean.slice(5).trim();
      // Extract quoted title
      const qm = target.match(/["']([^"']+)["']/);
      if (qm) target = qm[1] ?? target;
      else {
        // strip leading "a song"/"song"/"music"/"video"/"movie"
        target = target.replace(/^(a\s+)?(song|music|track|video|movie|film)\s*[:,]?\s*/i, '').trim();
        // if comma separated, take part after comma
        if (target.includes(',')) target = target.split(',').pop()!.trim().replace(/^["']|["']$/g, '');
      }
      if (!target) target = clean.slice(5).trim();
      toolName = 'os.play'; input = { target };
    }
    else if (lower.startsWith('speak ') || lower.startsWith('say ')) {
      const off = lower.startsWith('speak ') ? 6 : 4;
      toolName = 'os.speak'; input = { text: trimmed.slice(off).trim() };
    }
    else if (lower.startsWith('call ')) {
      toolName = 'os.call'; input = { number: trimmed.slice(5).trim() };
    }
    else if (lower.startsWith('run ')) {
      toolName = 'os.run'; input = { command: trimmed.slice(4).trim() };
    }
    else if (lower.startsWith('screenshot') || lower === 'take screenshot' || lower.startsWith('capture screen')) {
      toolName = 'os.screenshot'; input = {};
    }
    if (!toolName && providerRouter && defaultModel) {
      try {
        const resp = await providerRouter.complete({
          model: defaultModel,
          messages: [
            { role: 'system', content: 'You are an OS control router. Map the user command to one tool. Respond ONLY with JSON: {"tool": "<toolname or none>", "input": {}}. Tools: os.open(target), os.play(target), os.speak(text), os.call(number), os.run(command), os.screenshot(), os.camera(mode), os.photo(), os.video(seconds), os.whatsappSend(contact,message). If no OS action, tool="none".' },
            { role: 'user', content: trimmed },
          ],
          temperature: 0,
          jsonMode: true,
        }, new AbortController().signal);
        const parsed = JSON.parse(resp.content.trim().replace(/^```json\s*/i, '').replace(/```$/i, ''));
        if (parsed && typeof parsed.tool === 'string' && parsed.tool !== 'none') {
          toolName = parsed.tool;
          input = parsed.input && typeof parsed.input === 'object' ? parsed.input : {};
        }
      } catch { /* ignore */ }
    }
    if (toolName === 'os.speak') {
      try {
        const row = companionDatabase?.raw.prepare('SELECT value FROM settings WHERE key = ?').get('voice.settings') as { value?: string } | undefined;
        const vs = row?.value ? JSON.parse(row.value) : {};
        if (!input.voice && vs.voice) input.voice = vs.voice;
        if (input.rate === undefined && typeof vs.rate === 'number') input.rate = vs.rate;
      } catch { /* ignore */ }
    }
    if (!toolName) return { handled: false };
    const cm = confirmationManager!;
    const ctx = {
      signal: new AbortController().signal,
      platform: process.platform,
      permissions: new Set(['os.open','os.media','os.speak','os.telephony','os.exec','memory.read','memory.write','drafts.write']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audit: { record: () => {}, list: () => [] } as any,
      confirmation: cm,
      now: () => new Date(),
      logger,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    let result = await toolExecutor!.execute({ toolName, input, trust: 'trusted' }, ctx);
    if (result.status === 'failed') {
      await new Promise((r) => setTimeout(r, 300));
      result = await toolExecutor!.execute({ toolName, input, trust: 'trusted' }, ctx);
    }
    if (result.status === 'needs_confirmation' && result.actionHash) {
      confirmationManager!.confirm(result.actionHash);
      const result2 = await toolExecutor!.execute({ toolName, input, trust: 'trusted', confirmationHash: result.actionHash }, ctx);
      return { handled: true, toolName, result: result2 };
    }
    return { handled: true, toolName, result };
  });

  ipcMain.handle(ipcChannels.osConfirmTool, async (event, suppliedToken: unknown, actionHash: string): Promise<unknown> => {
    assertTrustedSender(event, suppliedToken);
    if (!confirmationManager) throw new Error('OS control unavailable');
    const ok = confirmationManager.confirm(actionHash);
    return { confirmed: ok };
  });
}

function createTray(): void {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
  );
  tray = new Tray(icon);
  tray.setToolTip("Companion");
  const updateMenu = () => {
    const menu = Menu.buildFromTemplate([
      { label: "Show", click: () => mainWindow?.show() },
      { type: "separator" },
      {
        label: backgroundPaused ? "Resume background" : "Pause background",
        click: () => {
          backgroundPaused = !backgroundPaused;
          if (backgroundPaused) backgroundScheduler?.stop();
          else backgroundScheduler?.start();
          updateMenu();
        },
      },
      {
        label: "Disable startup",
        click: () => app.setLoginItemSettings({ openAtLogin: false }),
      },
      { type: "separator" },
      { label: "Exit", click: () => app.quit() },
    ]);
    tray?.setContextMenu(menu);
  };
  updateMenu();
  tray.on("click", () => mainWindow?.show());
}


async function createWindow(): Promise<void> {
  const sessionToken = randomUUID();
  const window = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: "Companion",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      additionalArguments: [`--companion-session-token=${sessionToken}`],
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  mainWindow = window;
  sessionTokens.set(window.webContents.id, sessionToken);

  const webContentsId = window.webContents.id;

  window.on("closed", () => {
    sessionTokens.delete(webContentsId);
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl !== undefined) {
    await window.loadURL(devServerUrl);
  } else {
    await window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  logger.info("desktop window created", {
    renderer: devServerUrl === undefined ? "file" : "dev"
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId("com.kkc36.companion");
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => (
    permission === "media"
  ));
  configureFileLogging();
  configureProviderNetwork();
  await openStorage();
  await checkCredentialStore();
  registerIpc();
  await createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow().catch((error: unknown) => {
        logger.error("failed to recreate desktop window", { error });
      });
    }
  });
}).catch((error: unknown) => {
  logger.error("failed to start desktop app", { error });
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  backgroundScheduler?.stop();
  tray?.destroy();
  tray = null;
  companionDatabase?.close();
  companionDatabase = null;
});












