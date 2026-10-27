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

export default function App() {
  const [info, setInfo] = useState<any>(null);
  const [tab, setTab] = useState<'setup' | 'chat'>('setup');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [stored, setStored] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
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
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceModeRef = useRef(false);
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
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => () => {
    voiceModeRef.current = false;
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

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

  async function saveKey() {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result: any = await window.companion.credentialsSet(selected.id, apiKey.trim());
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

  function speakReply(content: string): void {
    if (!('speechSynthesis' in window) || !content.trim()) return;
    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.onstart = () => { speakingRef.current = true; setSpeaking(true); };
    utterance.onend = () => { speakingRef.current = false; setSpeaking(false); if (voiceModeRef.current) setVoiceState('listening'); };
    utterance.onerror = () => { speakingRef.current = false; setSpeaking(false); if (voiceModeRef.current) setVoiceState('listening'); };
    window.speechSynthesis.speak(utterance);
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
      if (voiceModeRef.current) setVoiceState('listening');
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
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceState('unsupported');
      setVoiceError('Live speech recognition is not available in this Electron runtime.');
      return;
    }
    setVoiceError('');
    voiceModeRef.current = true;
    setVoiceMode(true);
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onstart = () => setVoiceState('listening');
    recognition.onend = () => {
      if (voiceModeRef.current && !speakingRef.current) {
        window.setTimeout(() => { if (voiceModeRef.current) { try { recognition.start(); } catch { /* already starting */ } } }, 250);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        voiceModeRef.current = false;
        setVoiceMode(false);
        setVoiceState('off');
        setVoiceError('Microphone permission was denied. Enable it in Windows/Electron settings to listen.');
      } else if (event.error !== 'aborted') {
        setVoiceError(`Speech recognition: ${event.error}`);
      }
    };
    recognition.onresult = (event) => {
      let finalText = '';
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index]?.[0]?.transcript ?? '';
        if (event.results[index]?.isFinal) finalText += text;
        else interim += text;
      }
      setInterimTranscript(interim);
      if (finalText.trim()) {
        setInterimTranscript('');
        setVoiceState('processing');
        void sendMessage(finalText.trim(), true);
      }
    };
    recognitionRef.current = recognition;
    setVoiceState('starting');
    try { recognition.start(); } catch (error) { setVoiceError(String(error)); }
  }

  function stopListening(): void {
    voiceModeRef.current = false;
    setVoiceMode(false);
    setVoiceState('off');
    setInterimTranscript('');
    recognitionRef.current?.stop();
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
                    onClick={() => { setSelectedProvider(p.id); setValidation(null); }}
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
                    <button onClick={saveKey} disabled={busy || !apiKey.trim()}>Save key</button>
                  </div>

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
                  <button
                    key={c.id}
                    className={c.id === activeConv ? 'conversation active' : 'conversation'}
                    onClick={() => loadConversation(c.id)}
                  >
                    <span>{c.title || 'Untitled chat'}</span>
                    <small>{c.messageCount} messages</small>
                  </button>
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
                  {!voiceMode ? <button onClick={startListening} disabled={busy || !activeConv}>Start listening</button> : <button className="danger" onClick={stopListening}>Stop listening</button>}
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
