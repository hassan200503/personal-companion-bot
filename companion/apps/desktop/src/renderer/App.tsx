/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';

type Provider = {
  id: string;
  displayName: string;
  signupUrl: string;
  keyUrl: string;
  keyPrefixHint?: string;
  needsPhone: boolean;
  needsCard: boolean;
  regionNotes: string;
  models: string[];
  guideSteps: string[];
  privacyNote: string;
  pricingNote?: string;
  freeTier: boolean;
};

type DiscoveredModel = {
  id: string;
  name: string;
  free: boolean;
  contextLength?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
};

export default function App() {
  const [info, setInfo] = useState<any>(null);
  const [tab, setTab] = useState<'setup' | 'chat'>('setup');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [stored, setStored] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [validation, setValidation] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [onboarding, setOnboarding] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState('');
  const [custom, setCustom] = useState({ name: '', baseUrl: '', model: '', apiKey: '' });
  const [showCustomProvider, setShowCustomProvider] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceState, setVoiceState] = useState<'off' | 'starting' | 'listening' | 'processing' | 'paused' | 'unsupported'>('off');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [profile, setProfile] = useState<any>({});
  const [voiceSettings, setVoiceSettings] = useState<any>({ voice: '', rate: 0 });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [owner, setOwner] = useState<any>({});
  const [speaking, setSpeaking] = useState(false);
  const voiceModeRef = useRef(false);
  const voiceProcessingRef = useRef(false);
  const speakingRef = useRef(false);

  const selected = providers.find((p) => p.id === selectedProvider) || providers[0];

  async function loadAll() {
    try {
      setInfo(await window.companion.getInfo());
      const p = await window.companion.providersCatalog();
      setProviders(Array.isArray(p) ? p : []);
      setStored(await window.companion.credentialsList());
      setOnboarding(await window.companion.onboardingGetState());
      setConversations(await window.companion.chatListConversations());
      try { setProfile(await window.companion.memoryGetProfile()); } catch { /* ignore */ }
      try { setVoiceSettings(await window.companion.voiceGetSettings()); } catch { /* ignore */ }
      try { setOwner(await window.companion.memoryGetOwner()); } catch { /* ignore */ }
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void loadAll();
    const unsubscribe = window.companion.onVoiceTranscript((payload) => {
      const text = payload?.text?.trim();
      if (!text) return;
      if (!voiceModeRef.current) return;
      // barge-in: stop any TTS
      void window.companion.voiceStopSpeaking();
      if (!payload.final) {
        setInterimTranscript(text);
        return;
      }
      setInterimTranscript('');
      setVoiceState('processing');
      voiceProcessingRef.current = true;
      void sendMessage(text, true);
    });
    return () => {
      unsubscribe();
      voiceModeRef.current = false;
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (activeConv && !voiceModeRef.current && !muted) {
      startListening();
    }
    if (muted && voiceModeRef.current) {
      stopListening();
    }
  }, [activeConv, muted]);

  async function runOnboarding() {
    setBusy(true);
    setError('');
    setStatus('Running onboarding…');
    try {
      const result: any = await window.companion.onboardingRun();
      setOnboarding(result?.state ?? result);
      setStatus('Onboarding complete.');
    } catch (e) {
      setError(String(e));
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function testKey() {
    if (!selected) return;
    setBusy(true);
    setError('');
    setValidation(null);
    try {
      const result = await window.companion.credentialsValidate(selected.id, apiKey.trim());
      setValidation(result);
      setStatus(result?.valid ? 'Key looks good.' : 'Key validation failed.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function discoverModels() {
    if (!selected || !apiKey.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.companion.providersDiscoverModels(selected.id, apiKey.trim());
      const models = Array.isArray(result) ? result as DiscoveredModel[] : [];
      setDiscoveredModels(models);
      setSelectedModel(models[0]?.id || selected.models[0] || '');
      setStatus('Found ' + models.length + ' live model(s) for ' + selected.displayName + '.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveKey() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      let model = selectedModel;
      if (!model) {
        const discovered = await window.companion.providersDiscoverModels(selected.id, apiKey.trim());
        const models = Array.isArray(discovered) ? discovered as DiscoveredModel[] : [];
        model = models[0]?.id || selected.models[0] || '';
        setDiscoveredModels(models);
        setSelectedModel(model);
      }
      const result: any = await window.companion.credentialsSet(selected.id, apiKey.trim(), model || undefined);
      if (!result?.valid) throw new Error(result?.error || 'Could not save key');
      setStored(await window.companion.credentialsList());
      setApiKey('');
      setValidation(result);
      setStatus(`Saved ${selected.displayName}. ${result.model ? 'Default model: ' + result.model : ''}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function deleteKey(id: string) {
    setBusy(true);
    setError('');
    try {
      await window.companion.credentialsDelete(id);
      setStored(await window.companion.credentialsList());
      setStatus(`Removed ${id}.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function addCustomProvider() {
    setBusy(true);
    setError('');
    try {
      const result = await window.companion.providersAddCustom(
        { name: custom.name, baseUrl: custom.baseUrl, model: custom.model },
        custom.apiKey,
      );
      if (!result?.valid) throw new Error(result?.error || 'Could not add custom provider');
      setStored(await window.companion.credentialsList());
      setCustom({ name: '', baseUrl: '', model: '', apiKey: '' });
      setStatus(`Connected ${result.id ? 'custom provider' : 'provider'}. It will participate in automatic failover.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openLink(url: string) {
    try {
      await window.companion.openExternal(url);
    } catch (e) {
      setError(String(e));
    }
  }

  async function newConversation() {
    setBusy(true);
    setError('');
    try {
      const c: any = await window.companion.chatCreateConversation('New chat');
      setConversations((prev) => [c, ...prev]);
      setActiveConv(c.id);
      setMessages([]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadConversation(id: string) {
    setBusy(true);
    setError('');
    try {
      const c: any = await window.companion.chatGetConversation(id);
      setActiveConv(id);
      setMessages(Array.isArray(c?.messages) ? c.messages : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function speakReply(content: string): Promise<void> {
    if (muted) return;
    if (!content.trim()) return;
    speakingRef.current = true;
    setSpeaking(true);
    setVoiceState('processing');
    try {
      await window.companion.osTryCommand(`speak ${content}`);
    } catch {
      setVoiceError('Voice output failed. Check that Windows has an installed speech voice.');
    } finally {
      speakingRef.current = false;
      setSpeaking(false);
      if (voiceModeRef.current) {
        setVoiceState('listening');
      }
    }
  }


  async function sendMessage(content: string, speak = false): Promise<void> {
    if (!content.trim() || !activeConv) return;
    setBusy(true);
    setError('');
    try {
      // OS control natural-language commands
      try {
        const osResult: any = await window.companion.osTryCommand(content);
        if (osResult?.handled) {
          const summary = osResult.result?.status === 'needs_confirmation'
            ? `This action needs confirmation. Action hash: ${osResult.result.actionHash}`
            : `OS action ${osResult.toolName}: ${JSON.stringify(osResult.result?.result ?? osResult.result)}`;
          const userMsg = { id: crypto.randomUUID(), role: 'user', content, createdAt: new Date().toISOString() };
          const assistantMsg = { id: crypto.randomUUID(), role: 'assistant', content: summary, createdAt: new Date().toISOString() };
          setMessages((prev) => [...prev, userMsg, assistantMsg]);
          if (speak) speakReply(summary);
          return;
        }
      } catch { /* fall through to normal chat */ }
      const userMsg = { id: crypto.randomUUID(), role: 'user', content, createdAt: new Date().toISOString() };
      setMessages((prev) => [...prev, userMsg]);
      const result: any = await window.companion.chatSendMessage(activeConv, content);
      setMessages((prev) => [...prev, { id: result.id, role: result.role, content: result.content, createdAt: result.createdAt }]);
      setConversations(await window.companion.chatListConversations());
      if (speak) speakReply(result.content);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      voiceProcessingRef.current = false;
      if (voiceModeRef.current && !speakingRef.current) setVoiceState('listening');
    }
  }

  async function sendDraft() {
    if (!draft.trim()) return;
    const content = draft.trim();
    setDraft('');
    await sendMessage(content, false);
  }

  function startListening(): void {
    if (!activeConv) {
      setVoiceError('Create or select a chat before starting live listening.');
      return;
    }
    setVoiceError('');
    voiceModeRef.current = true;
    setVoiceMode(true);
    setVoiceState('starting');
    window.companion.voiceStart().then(() => {
      setVoiceState('listening');
    }).catch((e) => {
      setVoiceError(String(e));
      voiceModeRef.current = false;
      setVoiceMode(false);
      setVoiceState('off');
    });
  }

  function stopListening(): void {
    voiceModeRef.current = false;
    voiceProcessingRef.current = false;
    setVoiceMode(false);
    setVoiceState('off');
    setInterimTranscript('');
    void window.companion.voiceStop();
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }


  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <div>
            <h2>Companion</h2>
            <p>Your private AI assistant</p>
          </div>
        </div>

        <nav className="nav">
          <button className={tab === 'setup' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('setup')}>
            Setup
          </button>
          <button className={tab === 'chat' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('chat')}>
            Chat
          </button>
        </nav>

        {info && (
          <div className="sidebar-card">
            <div className="eyebrow">Runtime</div>
            <div>Electron {info.electronVersion}</div>
            <div>v{info.appVersion}</div>
          </div>
        )}

        {stored.length > 0 && (
          <div className="sidebar-card">
            <div className="eyebrow">Connected providers</div>
            {stored.map((id) => (
              <div key={id} className="provider-pill">{id}</div>
            ))}
          </div>
        )}

        <div className="sidebar-card">
          <div className="eyebrow">Voice settings</div>
          <input placeholder="Voice name" value={voiceSettings?.voice || ''} onChange={(e) => setVoiceSettings({ ...voiceSettings, voice: e.target.value })} />
          <input placeholder="Rate (-10..10)" value={voiceSettings?.rate ?? 0} onChange={(e) => setVoiceSettings({ ...voiceSettings, rate: Number(e.target.value) })} />
          <button onClick={async () => { await window.companion.voiceSetSettings(voiceSettings); }}>Save voice</button>
        </div>
        <div className="sidebar-card">
          <div className="eyebrow">Audit log</div>
          <button onClick={async () => { setAuditLogs(await window.companion.auditList()); }}>Load audit</button>
          <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{JSON.stringify(auditLogs, null, 2)}</pre>
        </div>
        <div className="sidebar-card">
          <div className="eyebrow">Updates</div>
          <button onClick={async () => { setUpdateInfo(await window.companion.appCheckUpdates()); }}>Check updates</button>
          <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap' }}>{JSON.stringify(updateInfo, null, 2)}</pre>
        </div>
        <div className="sidebar-card">
          <div className="eyebrow">Memory profile</div>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{JSON.stringify(profile, null, 2)}</pre>
          <button onClick={async () => { await window.companion.memoryClearProfile(); setProfile({}); }}>Clear memory</button>
          {Array.isArray(profile?.notes) && profile.notes.map((n: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span>{n.note}</span>
              <button onClick={async () => {
                const next = { ...profile, notes: profile.notes.filter((_: any, idx: number) => idx !== i) };
                await window.companion.memorySetProfile(next);
                setProfile(next);
              }}>×</button>
            </div>
          ))}
        </div>

        <div className="sidebar-card">
          <div className="eyebrow">Owner details</div>
          <input placeholder="Name" value={owner?.name || ''} onChange={(e) => setOwner({ ...owner, name: e.target.value })} />
          <input placeholder="Date of birth" value={owner?.dob || ''} onChange={(e) => setOwner({ ...owner, dob: e.target.value })} />
          <input placeholder="Phone" value={owner?.phone || ''} onChange={(e) => setOwner({ ...owner, phone: e.target.value })} />
          <button onClick={async () => { await window.companion.memorySetOwner(owner); setProfile(await window.companion.memoryGetProfile()); }}>Save owner</button>
        </div>
      </aside>

      <main className="main">
        {error && <div className="banner error">{error}</div>}
        {status && <div className="banner success">{status}</div>}
        {tab === 'setup' && (
          <div className="content-grid">
            <section className="card hero">
              <div className="eyebrow">Welcome</div>
              <h1>Set up Companion in minutes</h1>
              <p className="lede">
                Run a quick system check, choose a privacy preset, then connect one or more AI providers.
                Companion can switch providers automatically when one is unavailable.
              </p>
              <div className="actions">
                <button onClick={runOnboarding} disabled={busy}>Run onboarding</button>
                <button className="ghost" onClick={() => setTab('chat')} disabled={busy}>Open chat</button>
              </div>
            </section>

            <section className="card">
              <div className="section-head">
                <h3>Onboarding state</h3>
                <span className="muted">{onboarding?.currentStep ? `Current: ${onboarding.currentStep}` : onboarding?.completedAt ? 'Completed' : 'Not started'}</span>
              </div>
              {!onboarding ? (
                <p className="muted">No onboarding run yet. Click “Run onboarding” to check your system and choose a privacy preset.</p>
              ) : (
                <div className="saved-list">
                  <div className="saved-item">
                    <span>Overall status</span>
                    <span>{onboarding.completedAt ? 'Completed' : onboarding.currentStep ? 'In progress' : 'Not started'}</span>
                  </div>
                  {onboarding.preset && (
                    <div className="saved-item">
                      <span>Privacy preset</span>
                      <span>{onboarding.preset}</span>
                    </div>
                  )}
                  {onboarding.startedAt && (
                    <div className="saved-item">
                      <span>Started</span>
                      <span>{new Date(onboarding.startedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {onboarding.completedAt && (
                    <div className="saved-item">
                      <span>Completed</span>
                      <span>{new Date(onboarding.completedAt).toLocaleString()}</span>
                    </div>
                  )}
                  {Object.keys(onboarding.completed || {}).length > 0 && (
                    <div>
                      <div className="field-label" style={{ marginBottom: 8 }}>Completed steps</div>
                      <div className="saved-list">
                        {Object.entries(onboarding.completed).map(([key, value]: any) => (
                          <div key={key} className="saved-item">
                            <span>{key.replace(/-/g, ' ')}</span>
                            <span>{value?.outcome ?? 'completed'}{value?.timestamp ? ` · ${new Date(value.timestamp).toLocaleString()}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Object.keys(onboarding.failed || {}).length > 0 && (
                    <div>
                      <div className="field-label" style={{ marginBottom: 8 }}>Failed steps</div>
                      <div className="saved-list">
                        {Object.entries(onboarding.failed).map(([key, value]: any) => (
                          <div key={key} className="saved-item">
                            <span>{key.replace(/-/g, ' ')}</span>
                            <span>{value?.error ?? value?.outcome ?? 'failed'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="card">
              <div className="section-head">
                <h3>Add another provider</h3>
                <button className="ghost" onClick={() => setShowCustomProvider((value) => !value)}>{showCustomProvider ? 'Hide form' : 'Create new provider'}</button>
              </div>
              {!showCustomProvider ? <p className="muted">Add a provider that is not in the default list using any HTTPS OpenAI-compatible endpoint.</p> : <>
              <p className="muted">Use this for a favourite model or a self-hosted gateway. Companion stores only the API key in Windows Credential Manager.</p>
              <div className="custom-grid">
                <input aria-label="Provider name" placeholder="Provider name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
                <input aria-label="Base URL" placeholder="https://api.example.com/v1" value={custom.baseUrl} onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })} />
                <input aria-label="Model name" placeholder="model-name" value={custom.model} onChange={(e) => setCustom({ ...custom, model: e.target.value })} />
                <input aria-label="Custom provider API key" type="password" placeholder="API key" value={custom.apiKey} onChange={(e) => setCustom({ ...custom, apiKey: e.target.value })} />
              </div>
              <div className="actions"><button onClick={addCustomProvider} disabled={busy || !custom.name || !custom.baseUrl || !custom.model || !custom.apiKey}>Test and add provider</button></div>
              </>}
            </section>

            <section className="card">
              <div className="section-head">
                <h3>Connect an AI provider</h3>
                <span className="muted">Connect one or more providers for automatic failover</span>
              </div>

              <div className="provider-grid">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    className={p.id === selectedProvider ? 'provider-card active' : 'provider-card'}
                    onClick={() => { setSelectedProvider(p.id); setValidation(null); setDiscoveredModels([]); setSelectedModel(''); }}
                  >
                    <div className="provider-name">{p.displayName}</div>
                    <div className="provider-meta">
                      {p.needsCard ? 'Card required' : 'No card'} · {p.needsPhone ? 'Phone required' : 'No phone'}
                    </div>
                    <div className="provider-models">{p.models.slice(0, 2).join(', ')}</div>
                  </button>
                ))}
              </div>

              {selected && (
                <div className="provider-detail">
                  <h4>{selected.displayName}</h4>
                  <p className="muted">{selected.privacyNote}</p>
                  <p className="muted">{selected.pricingNote}</p>

                  <div className="link-row">
                    <button className="ghost" onClick={() => openLink(selected.signupUrl)}>Create account</button>
                    <button className="ghost" onClick={() => openLink(selected.keyUrl)}>Get API key</button>
                  </div>

                  <ol className="guide">
                    {selected.guideSteps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>

                  <label className="field-label" htmlFor="apiKey">API key{selected.keyPrefixHint ? ` (starts with ${selected.keyPrefixHint})` : ''}</label>
                  <input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={selected.keyPrefixHint ? `${selected.keyPrefixHint}...` : 'Paste your API key'}
                  />

                  <div className="actions">
                    <button onClick={testKey} disabled={busy || !apiKey.trim()}>Test key</button>
                    <button onClick={discoverModels} disabled={busy || !apiKey.trim()}>Discover live models</button>
                    <button onClick={saveKey} disabled={busy || !apiKey.trim()}>Save key</button>
                  </div>

                  {(discoveredModels.length > 0 || selectedModel) && (
                    <label className="field-label" htmlFor="modelSelect">
                      Model
                      <select id="modelSelect" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                        {discoveredModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}{model.free ? ' · free' : ''}
                          </option>
                        ))}
                        {discoveredModels.length === 0 && selectedModel && <option value={selectedModel}>{selectedModel}</option>}
                      </select>
                    </label>
                  )}

                  {validation && (
                    <div className={validation.valid ? 'banner success' : 'banner error'}>
                      {validation.valid ? 'Validated successfully.' : validation.error}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="card">
              <div className="section-head">
                <h3>Saved credentials</h3>
                <span className="muted">{stored.length} provider(s)</span>
              </div>
              {stored.length === 0 ? (
                <p className="muted">No credentials saved yet.</p>
              ) : (
                <div className="saved-list">
                  {stored.map((id) => (
                    <div key={id} className="saved-item">
                      <span>{id}</span>
                      <button className="danger" onClick={() => deleteKey(id)} disabled={busy}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        {tab === 'chat' && (
          <div className="chat-layout">
            <aside className="chat-sidebar">
              <button className="primary" onClick={newConversation} disabled={busy}>New chat</button>
              <div className="conversation-list">
                {conversations.map((c: any) => (
                  <div key={c.id} className="conversation-row" style={{ display: 'flex', gap: 4 }}>
                    <button
                      className={c.id === activeConv ? 'conversation active' : 'conversation'}
                      onClick={() => loadConversation(c.id)}
                      style={{ flex: 1 }}
                    >
                      <span>{c.title || 'Untitled chat'}</span>
                      <small>{c.messageCount} messages</small>
                    </button>
                    <button onClick={async () => {
                      await window.companion.chatDeleteConversation(c.id);
                      setConversations(await window.companion.chatListConversations());
                      if (activeConv === c.id) { setActiveConv(null); setMessages([]); }
                    }} title="Delete chat">x</button>
                  </div>
                ))}
              </div>
            </aside>

            <section className="chat-main">
              <div className={voiceMode ? 'voice-panel listening' : 'voice-panel'}>
                <div className="voice-status">
                  <span className={voiceMode ? 'voice-dot live' : 'voice-dot'} aria-hidden="true" />
                  <div>
                    <strong>{voiceMode ? (speaking ? 'Companion is speaking' : voiceState === 'processing' ? 'Processing what you said' : 'Listening live') : 'Live voice is off'}</strong>
                    <div className="muted">{voiceMode ? 'Microphone active · raw audio is not recorded' : 'Start this only when you want the microphone active'}</div>
                  </div>
                </div>
                <div className="voice-actions">
                  {voiceMode ? <button className="danger" onClick={stopListening}>Pause listening</button> : <span className="muted">Always listening…</span>}
                  <button onClick={() => setMuted((m) => !m)}>{muted ? 'Unmute' : 'Mute'}</button>
                </div>
                <div className="living-indicator" aria-live="polite">
                  <span className="pulse" /> Companion is always listening and learning
                </div>
                {interimTranscript && <div className="voice-transcript" aria-live="polite">{interimTranscript}</div>}
                {voiceError && <div className="voice-error" role="alert">{voiceError}</div>}
              </div>
              <div className="messages">
                {messages.length === 0 && (
                  <div className="empty-state">
                    <h3>Start a conversation</h3>
                    <p>Create a new chat and send a message. Your connected provider will respond.</p>
                  </div>
                )}
                {messages.map((m: any) => (
                  <div key={m.id} className={`message ${m.role}`}>
                    <div className="message-role">{m.role}</div>
                    <div className="message-content">{m.content}</div>
                  </div>
                ))}
              </div>

              <div className="composer">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={activeConv ? 'Type a message…' : 'Create or select a chat first'}
                  disabled={!activeConv || busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendDraft();
                    }
                  }}
                />
                <button onClick={sendDraft} disabled={!activeConv || busy || !draft.trim()}>Send</button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
