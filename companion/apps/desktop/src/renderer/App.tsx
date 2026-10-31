/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { composeGreeting } from '@companion/core/voice/greeting';
import { normalizeSpeech } from '@companion/core/cognition/style-normalizer';
import { normalizePersonaState } from '@companion/core/voice/personality';
import { isNoiseTranscript, isQuietHours } from '@companion/core/voice/speech';
import {
  advanceVoiceGuide,
  createVoiceGuideProgress,
  getVoiceGuideStep,
  isVoiceGuideComplete,
  needsVoiceGuide,
  normalizeVoiceGuideProgress,
  speakableGuideLine,
  voiceGuideSteps,
  type VoiceGuideProgress
} from '@companion/core/onboarding/voice-guide';
import { VoiceCapture } from './voice-capture';
import { AlertsRail, type ProactiveAlert } from './components/AlertsRail';
import { ChatStage } from './components/ChatStage';
import { ConfirmModal } from './components/ConfirmModal';
import { OnboardingHero } from './components/OnboardingHero';
import { SettingsShell, type EmailForm } from './components/SettingsShell';
import { VoiceDock } from './components/VoiceDock';
import type { ProposedMemory } from './components/MemoryInbox';

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
  const [tab, setTab] = useState<'setup' | 'chat' | 'settings'>('setup');
  const [settingsSection, setSettingsSection] = useState<'voice' | 'persona' | 'privacy' | 'email' | 'providers' | 'memory' | 'data'>('voice');
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [proposed, setProposed] = useState<ProposedMemory[]>([]);
  const [emailForm, setEmailForm] = useState<EmailForm>({ host: 'imap.gmail.com', port: 993, user: '', password: '', tls: true, configured: false });
  const [emailStatus, setEmailStatus] = useState('');
  const [grantable, setGrantable] = useState<string[]>([]);
  const [updateLabel, setUpdateLabel] = useState('');
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
  const [voiceState, setVoiceState] = useState<'off' | 'starting' | 'listening' | 'processing' | 'speaking' | 'paused' | 'error' | 'unsupported'>('off');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceWarning, setVoiceWarning] = useState('');
  const [voiceEngine, setVoiceEngine] = useState('none');
  const [voiceSettings, setVoiceSettings] = useState<any>({ voice: '', rate: 0 });
  const [voiceVoices, setVoiceVoices] = useState<Array<{ name: string; language: string; id: string; gender?: string }>>([]);
  const [persona, setPersona] = useState<any>(null);
  const [calibrationStep, setCalibrationStep] = useState<string | null>(null);
  const [calibrationQuestion, setCalibrationQuestion] = useState('');
  const [speechPrivacyNeeded, setSpeechPrivacyNeeded] = useState(false);
  const [cloudConsentNeeded, setCloudConsentNeeded] = useState(false);
  const [profile, setProfile] = useState<any>({});
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [, setUpdateInfo] = useState<any>(null);
  const [muted, setMuted] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ actionHash: string; toolName: string; input: any; readBackText?: string; pendingVoiceConfirmation?: boolean } | null>(null);
  const [owner, setOwner] = useState<any>({});
  const [ownerLoaded, setOwnerLoaded] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [voiceGuide, setVoiceGuide] = useState<VoiceGuideProgress>(createVoiceGuideProgress());
  const [guideAnswer, setGuideAnswer] = useState('');
  const [guideActive, setGuideActive] = useState(false);
  const [guidePrompt, setGuidePrompt] = useState(getVoiceGuideStep('welcome').prompt);
  const voiceModeRef = useRef(false);
  const voiceGuideRef = useRef<VoiceGuideProgress>(createVoiceGuideProgress());
  const guideActiveRef = useRef(false);
  const voiceProcessingRef = useRef(false);
  const speakingRef = useRef(false);
  const greetedRef = useRef(false);
  const activeConvRef = useRef<string | null>(null);
  const sendMessageRef = useRef<(content: string, speak?: boolean, source?: 'owner_ui' | 'owner_voice') => Promise<void>>(async () => {});
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const handleTranscriptRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const lastSpokenRef = useRef('');
  const ignoreUntilRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const recentQuestionsRef = useRef<string[]>([]);
  const proactiveDayRef = useRef({ day: '', count: 0 });
  const calibrationStepRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const autoStartedRef = useRef(false);
  const captureRef = useRef<VoiceCapture | null>(null);
  const voiceSettingsRef = useRef<any>({});
  const windowFocusedRef = useRef(true);
  const consecutiveNoiseRef = useRef(0);

  const selected = providers.find((p) => p.id === selectedProvider) || providers[0];

  async function loadAll() {
    try {
      setInfo(await window.companion.getInfo());
      const p = await window.companion.providersCatalog();
      setProviders(Array.isArray(p) ? p : []);
      setStored(await window.companion.credentialsList());
      setOnboarding(await window.companion.onboardingGetState());
      const convs = await window.companion.chatListConversations();
      if (convs.length === 0) {
        const c: any = await window.companion.chatCreateConversation('Companion');
        setConversations([c]);
        setActiveConv(c.id);
        setMessages([]);
      } else {
        setConversations(convs);
        setActiveConv(convs[0].id);
        const c: any = await window.companion.chatGetConversation(convs[0].id);
        setMessages(Array.isArray(c?.messages) ? c.messages : []);
      }
      try { setProfile(await window.companion.memoryGetProfile()); } catch { /* ignore */ }
      try {
        const settings: any = await window.companion.voiceGetSettings();
        setVoiceSettings(settings ?? {});
        voiceSettingsRef.current = settings ?? {};
        setMuted(settings?.muted === true);
        mutedRef.current = settings?.muted === true;
        setCloudConsentNeeded(settings?.cloudSpeechConsent !== true);
      } catch { /* ignore */ }
      try {
        const loadedPersona: any = await window.companion.personaGet();
        const state = normalizePersonaState(loadedPersona?.state ?? loadedPersona);
        setPersona(state);
        if (loadedPersona?.nextQuestion) {
          setCalibrationStep(loadedPersona.step ?? null);
          setCalibrationQuestion(loadedPersona.nextQuestion);
        }
      } catch { /* ignore */ }
      try {
        const voices: any = await window.companion.voiceListVoices();
        setVoiceVoices(Array.isArray(voices?.synthesis) ? voices.synthesis : []);
      } catch { /* ignore */ }
      try {
        const raw = localStorage.getItem('companion.proactive');
        const parsed = raw ? JSON.parse(raw) : null;
        const today = new Date().toISOString().slice(0, 10);
        if (parsed?.day === today && Number.isFinite(parsed.count)) {
          proactiveDayRef.current = { day: today, count: Number(parsed.count) };
        } else {
          proactiveDayRef.current = { day: today, count: 0 };
        }
      } catch { /* ignore */ }
      let loadedOwner: any = {};
      try { loadedOwner = await window.companion.memoryGetOwner(); setOwner(loadedOwner); } catch { /* ignore */ } finally { setOwnerLoaded(true); }
      try {
        const loadedGuide = normalizeVoiceGuideProgress(await window.companion.onboardingGetVoiceGuide());
        voiceGuideRef.current = loadedGuide;
        setVoiceGuide(loadedGuide);
        const ownerName = typeof loadedOwner?.name === 'string' ? loadedOwner.name : '';
        const shouldGuide = needsVoiceGuide(loadedGuide, ownerName);
        setGuideActive(shouldGuide && !isVoiceGuideComplete(loadedGuide));
        guideActiveRef.current = shouldGuide && !isVoiceGuideComplete(loadedGuide);
        setGuidePrompt(getVoiceGuideStep(loadedGuide.currentStep).prompt);
      } catch { /* ignore */ }
      try {
        const cfg: any = await window.companion.emailGetConfig();
        setEmailForm({
          host: cfg?.host || 'imap.gmail.com',
          port: Number(cfg?.port) || 993,
          user: cfg?.user || '',
          password: '',
          tls: cfg?.tls !== false,
          configured: cfg?.configured === true,
        });
      } catch { /* ignore */ }
      try {
        const inbox: any = await window.companion.memoryListProposed();
        setProposed(Array.isArray(inbox) ? inbox : []);
      } catch { /* ignore */ }
      try {
        const perms: any = await window.companion.permissionsList();
        setGrantable(Array.isArray(perms?.grantable) ? perms.grantable : []);
      } catch { /* ignore */ }
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
    startListeningRef.current = startListening;
    handleTranscriptRef.current = handleTranscript;
  });

  useEffect(() => {
    void loadAll();
    const unsubscribe = window.companion.onVoiceEvent((event) => {
      // Native helper is TTS-only now; listen for synthesis lifecycle events.
      if (event.type === 'speech') {
        const started = event.state === 'started';
        speakingRef.current = started;
        setSpeaking(started);
        if (started) captureRef.current?.pause();
        setVoiceState(started ? 'speaking' : (voiceModeRef.current ? 'listening' : 'off'));
        if (!started) {
          ignoreUntilRef.current = Date.now() + 1200;
          if (voiceModeRef.current) captureRef.current?.resume();
        }
        return;
      }
      if (event.type === 'state' && event.state === 'error') {
        setVoiceError(event.error || 'The voice helper stopped.');
      }
    });
    const unsubAlert = window.companion.onProactiveAlert((payload) => {
      setAlerts((prev) => {
        if (prev.some((a) => a.id === payload.id)) return prev;
        return [{ id: payload.id, topic: payload.topic, message: payload.message, reason: payload.reason, channel: payload.channel }, ...prev].slice(0, 8);
      });
      if (!mutedRef.current && payload.message) {
        void speakDigest(payload.message);
      }
    });
    return () => {
      unsubscribe();
      unsubAlert();
      voiceModeRef.current = false;
      void captureRef.current?.stop();
      captureRef.current = null;
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (muted && voiceModeRef.current) {
      stopListening();
    }
  }, [muted]);

  useEffect(() => {
    const updateFocus = () => {
      const focused = document.hasFocus() && !document.hidden;
      windowFocusedRef.current = focused;
      if (!focused && voiceModeRef.current && voiceSettingsRef.current?.listenWhenUnfocused !== true) {
        stopListening();
      }
    };
    window.addEventListener('focus', updateFocus);
    window.addEventListener('blur', updateFocus);
    document.addEventListener('visibilitychange', updateFocus);
    updateFocus();
    return () => {
      window.removeEventListener('focus', updateFocus);
      window.removeEventListener('blur', updateFocus);
      document.removeEventListener('visibilitychange', updateFocus);
    };
  }, []);

  useEffect(() => {
    if (greetedRef.current || !activeConv || !ownerLoaded) return;
    greetedRef.current = true;
    if (guideActiveRef.current) {
      void (async () => {
        if (!muted) await speakReply(guidePrompt || getVoiceGuideStep(voiceGuideRef.current.currentStep).prompt);
      })();
      return;
    }
    const name = typeof owner?.name === 'string' ? owner.name.trim() : '';
    const greetingResult = composeGreeting({
      ownerName: name,
      pronunciation: voiceSettings?.pronunciation,
      now: new Date(),
      recentGreetings: voiceSettings?.recentGreetings,
      quietHours: voiceSettings?.quietHours,
      muted
    });
    const greeting = greetingResult.text;
    const nextSettings = { ...voiceSettings, recentGreetings: [...(voiceSettings?.recentGreetings ?? []), greeting].slice(-10) };
    setVoiceSettings(nextSettings);
    void window.companion.voiceSetSettings(nextSettings);
    setMessages((prev) => prev.length === 0
      ? [{ id: crypto.randomUUID(), role: 'assistant', content: greeting, createdAt: new Date().toISOString() }]
      : prev);
    void (async () => {
      if (!muted) await speakReply(greeting);
      if (calibrationStepRef.current && calibrationQuestion) {
        await speakReply(calibrationQuestion);
      }
    })();
  }, [activeConv, owner?.name, ownerLoaded]);

  useEffect(() => {
    if (tab !== 'chat') {
      if (voiceModeRef.current) stopListening();
      return;
    }
    if (!activeConv || muted || voiceSettings?.autoStart === false || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startListeningRef.current();
  }, [tab, activeConv, muted, voiceSettings?.autoStart]);

  async function toggleMute(): Promise<void> {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    const nextSettings = { ...voiceSettings, muted: next };
    setVoiceSettings(nextSettings);
    await window.companion.voiceSetSettings(nextSettings);
    if (next) stopListening();
  }

  async function savePersona(next: any): Promise<void> {
    const normalized = normalizePersonaState(next);
    const result: any = await window.companion.personaSet(normalized);
    if (result?.ok) {
      setPersona(result.state);
      setStatus('Personality saved.');
    }
  }

  async function beginCalibration(): Promise<void> {
    const loaded: any = await window.companion.personaGet();
    const state = normalizePersonaState(loaded?.state ?? loaded);
    setPersona(state);
    if (loaded?.nextQuestion) {
      calibrationStepRef.current = loaded.step;
      setCalibrationStep(loaded.step);
      setCalibrationQuestion(loaded.nextQuestion);
      setMessages((prev) => [...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: loaded.nextQuestion, createdAt: new Date().toISOString() }
      ]);
      await speakReply(loaded.nextQuestion);
      if (!voiceModeRef.current) await startListening();
    } else {
      setStatus('Personality setup is already complete.');
    }
  }

  async function persistVoiceGuideDraft(progress: VoiceGuideProgress): Promise<void> {
    const draft = progress.draft;
    const nextOwner = {
      ...owner,
      name: draft.ownerName || owner?.name || '',
      phone: draft.ownerPhone || owner?.phone || '',
      dob: draft.ownerDob || owner?.dob || ''
    };
    setOwner(nextOwner);
    await window.companion.memorySetOwner(nextOwner);

    const currentPersona = normalizePersonaState(persona ?? {});
    const nextPersona = {
      ...currentPersona,
      profile: {
        ...currentPersona.profile,
        ownerName: draft.ownerName || currentPersona.profile.ownerName,
        companionName: draft.companionName || currentPersona.profile.companionName,
        tone: draft.tone,
        toneDescription: draft.toneDescription || currentPersona.profile.toneDescription,
        selfDescription: draft.toneDescription || currentPersona.profile.selfDescription,
        avoidTopics: draft.avoidTopics.length ? draft.avoidTopics : currentPersona.profile.avoidTopics,
        updatedAt: new Date().toISOString()
      },
      calibration: progress.completedAt
        ? {
            ...currentPersona.calibration,
            completedAt: progress.completedAt,
            startedAt: progress.startedAt ?? currentPersona.calibration.startedAt,
            step: voiceGuideSteps.length,
            answers: {
              ...currentPersona.calibration.answers,
              name: draft.ownerName,
              tone: draft.toneDescription,
              boundaries: draft.avoidTopics.join(', ')
            }
          }
        : {
            ...currentPersona.calibration,
            startedAt: progress.startedAt ?? currentPersona.calibration.startedAt
          }
    };
    const saved: any = await window.companion.personaSet(nextPersona);
    if (saved?.ok) setPersona(saved.state);

    const nextSettings = {
      ...voiceSettingsRef.current,
      cloudSpeechConsent: draft.cloudSpeechConsent === true ? true : voiceSettingsRef.current?.cloudSpeechConsent === true
    };
    if (draft.cloudSpeechConsent) {
      nextSettings.cloudSpeechConsent = true;
      setCloudConsentNeeded(false);
    }
    setVoiceSettings(nextSettings);
    voiceSettingsRef.current = nextSettings;
    await window.companion.voiceSetSettings(nextSettings);
    await window.companion.onboardingSetPreset(draft.privacyPreset);
    await window.companion.onboardingSetVoiceGuide(progress);
  }

  async function submitVoiceGuideAnswer(raw: string): Promise<void> {
    if (!guideActiveRef.current) return;
    const text = raw.trim();
    if (!text) return;
    voiceProcessingRef.current = true;
    setVoiceState('processing');
    try {
      const providerConnected = stored.includes('gemini') || stored.length > 0;
      const result = advanceVoiceGuide(voiceGuideRef.current, text, { providerConnected });
      if (result.error) {
        setVoiceError(result.error);
        await speakReply(result.error);
        return;
      }
      voiceGuideRef.current = result.progress;
      setVoiceGuide(result.progress);
      setGuideAnswer('');
      setGuidePrompt(result.prompt);
      await persistVoiceGuideDraft(result.progress);
      const line = speakableGuideLine(result.acknowledgment, result.prompt);
      setMessages((prev) => [...prev,
        { id: crypto.randomUUID(), role: 'user', content: text, createdAt: new Date().toISOString() },
        { id: crypto.randomUUID(), role: 'assistant', content: line || result.acknowledgment, createdAt: new Date().toISOString() }
      ]);
      if (result.progress.draft.cloudSpeechConsent && !voiceModeRef.current && result.progress.currentStep !== 'provider') {
        // Listening can start after consent; provider step still needs a key first for transcription.
      }
      if (line) await speakReply(line);

      if (result.done) {
        try {
          await window.companion.onboardingRun();
          setOnboarding(await window.companion.onboardingGetState());
        } catch { /* system check is best-effort */ }
        guideActiveRef.current = false;
        setGuideActive(false);
        setStatus('Voice onboarding complete. You can talk naturally now.');
        setTab('chat');
        if (result.progress.draft.cloudSpeechConsent && stored.length > 0) {
          await startListening();
        }
      } else if (
        result.progress.draft.cloudSpeechConsent &&
        stored.length > 0 &&
        !voiceModeRef.current &&
        result.progress.currentStep !== 'provider'
      ) {
        await startListening();
      }
    } catch (e) {
      setVoiceError(String(e));
    } finally {
      voiceProcessingRef.current = false;
      if (voiceModeRef.current) {
        captureRef.current?.resume();
        setVoiceState('listening');
      } else {
        setVoiceState('off');
      }
    }
  }

  async function startVoiceOnboarding(): Promise<void> {
    const fresh = createVoiceGuideProgress({
      startedAt: new Date().toISOString(),
      currentStep: 'welcome',
      draft: {
        ...createVoiceGuideProgress().draft,
        ownerName: typeof owner?.name === 'string' ? owner.name : '',
        ownerPhone: typeof owner?.phone === 'string' ? owner.phone : '',
        ownerDob: typeof owner?.dob === 'string' ? owner.dob : '',
        companionName: persona?.profile?.companionName || 'Companion',
        providerConnected: stored.length > 0,
        cloudSpeechConsent: voiceSettingsRef.current?.cloudSpeechConsent === true
      }
    });
    voiceGuideRef.current = fresh;
    setVoiceGuide(fresh);
    setGuidePrompt(getVoiceGuideStep('welcome').prompt);
    guideActiveRef.current = true;
    setGuideActive(true);
    setTab('setup');
    await window.companion.onboardingSetVoiceGuide(fresh);
    await speakReply(getVoiceGuideStep('welcome').prompt);
  }

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
      const nextStored = await window.companion.credentialsList();
      setStored(nextStored);
      setApiKey('');
      setValidation(result);
      setStatus(`Saved ${selected.displayName}. ${result.model ? 'Default model: ' + result.model : ''}`);
      if (guideActiveRef.current) {
        const nextGuide = {
          ...voiceGuideRef.current,
          draft: { ...voiceGuideRef.current.draft, providerConnected: nextStored.length > 0 }
        };
        voiceGuideRef.current = nextGuide;
        setVoiceGuide(nextGuide);
        await window.companion.onboardingSetVoiceGuide(nextGuide);
        setStatus(`Saved ${selected.displayName}. Return to the voice guide and say continue.`);
      }
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
    if (mutedRef.current) return;
    const safeContent = normalizeSpeech(content, { speakSafe: true, maxSentences: 3 });
    if (!safeContent.trim()) return;
    lastSpokenRef.current = safeContent;
    speakingRef.current = true;
    setSpeaking(true);
    setVoiceState('speaking');
    const bargeInAllowed = voiceSettingsRef.current?.bargeIn !== false;
    // Keep the mic open when barge-in is on so "stop" can interrupt mid-speech.
    if (!bargeInAllowed) captureRef.current?.pause();
    else if (voiceModeRef.current) captureRef.current?.resume();
    try {
      const result: any = await window.companion.voiceSpeak(safeContent);
      if (result?.error && !result?.skipped) {
        setVoiceError(result.error);
      }
    } catch {
      setVoiceError('Voice output failed. Check that Windows has an installed speech voice.');
    } finally {
      speakingRef.current = false;
      setSpeaking(false);
      ignoreUntilRef.current = Date.now() + 1200;
      if (voiceModeRef.current) captureRef.current?.resume();
      setVoiceState(voiceModeRef.current ? 'listening' : 'off');
    }
  }

  /** Chunked read-aloud for email/research digests (barge-in friendly). */
  async function speakDigest(content: string): Promise<void> {
    if (mutedRef.current) return;
    const text = String(content || '').trim();
    if (!text) return;
    lastSpokenRef.current = text.slice(0, 240);
    speakingRef.current = true;
    setSpeaking(true);
    setVoiceState('speaking');
    const bargeInAllowed = voiceSettingsRef.current?.bargeIn !== false;
    if (!bargeInAllowed) captureRef.current?.pause();
    else if (voiceModeRef.current) captureRef.current?.resume();
    try {
      const result: any = await window.companion.voiceSpeakChunks(text);
      if (result?.error && !result?.skipped && !result?.interrupted) {
        setVoiceError(result.error);
      }
    } catch {
      await speakReply(text);
    } finally {
      speakingRef.current = false;
      setSpeaking(false);
      ignoreUntilRef.current = Date.now() + 1200;
      if (voiceModeRef.current) captureRef.current?.resume();
      setVoiceState(voiceModeRef.current ? 'listening' : 'off');
    }
  }


  async function sendMessage(content: string, speak = false, source: 'owner_ui' | 'owner_voice' = 'owner_ui'): Promise<void> {
    if (!content.trim() || !activeConvRef.current) return;
    lastActivityRef.current = Date.now();
    setBusy(true);
    setError('');
    try {
      // OS control natural-language commands. The main process decides whether
      // the action is allowed; the UI never confirms on the owner's behalf.
      try {
        const osResult: any = await window.companion.osTryCommand(content, source);
        if (osResult?.handled) {
          const status = osResult.result?.status;
          const failError = String(osResult.result?.error ?? 'unknown error');
          const failSummary = failError === 'timeout'
            ? 'That took too long while looking things up on this PC. Try naming the app more clearly, or say it again in a moment.'
            : failError === 'aborted'
              ? 'I stopped that action before it finished.'
              : `That failed: ${failError}`;
          const openResolved = osResult.result?.result?.resolved || osResult.input?.target;
          const summary = status === 'needs_confirmation'
            ? `I need your explicit confirmation before I do that. Review the action below; nothing has been sent or changed yet.`
            : status === 'needs_read_back'
              ? `Say "yes" to proceed or "no" to cancel. ${osResult.result?.readBackText ?? ''}`
            : status === 'denied'
              ? `I did not run that. ${osResult.result?.error ?? 'The action was blocked.'}`
            : status === 'failed'
                ? failSummary
                : osResult.toolName === 'os.open'
                  ? osResult.result?.result?.opened
                    ? `Opened ${openResolved || 'that'}.`
                    : `I could not open ${openResolved || 'that'}: ${osResult.result?.result?.error ?? osResult.result?.error ?? 'unknown error'}`
                : osResult.toolName === 'os.whatsappSend'
                ? `WhatsApp: ${osResult.result?.result?.sent || osResult.result?.result?.verified
                  ? 'Typed and observed in the chat window. I am not claiming phone delivery.'
                  : osResult.result?.result?.typed
                    ? 'Typed, but I could not confirm it appeared in the chat.'
                    : `Not sent. ${osResult.result?.result?.error ?? ''}`.trim()}`
                : osResult.toolName === 'os.play'
                  ? osResult.result?.result?.played
                    ? `Playing ${osResult.result?.result?.resolved ? 'the matched local file' : 'it'} now.`
                    : osResult.result?.result?.error === 'ambiguous_local_match'
                      ? `I found a few matches: ${(osResult.result?.result?.candidates ?? []).slice(0, 5).join(', ') || 'several files'}. Tell me which one.`
                      : osResult.result?.result?.error === 'search_page_opened_needs_selection'
                        ? osResult.result?.result?.provider === 'spotify'
                          ? 'I opened Spotify search for that. Pick the track you want; I did not auto-play a guess.'
                          : 'I opened the official YouTube search page. Pick the result you want; I did not scrape or guess.'
                        : `I could not play that: ${osResult.result?.result?.error ?? 'unknown error'}`
                  : osResult.toolName === 'os.call'
                    ? osResult.result?.result?.initiated
                      ? `I opened the dialer for ${osResult.input?.number ?? osResult.input?.target ?? 'that contact'}. I cannot confirm the call connected.`
                      : `I could not start the call: ${osResult.result?.result?.error ?? osResult.result?.error ?? 'unknown error'}`
                    : osResult.toolName === 'web.research' || osResult.toolName === 'email.summarize' || osResult.toolName === 'email.important' || osResult.toolName === 'email.readAloud' || osResult.toolName === 'email.listRecent'
                      ? String(osResult.result?.result?.summary ?? osResult.result?.result?.spoken ?? osResult.result?.result?.text ?? `Done (${status}).`)
                    : osResult.toolName === 'email.send'
                      ? osResult.result?.result?.sent
                        ? String(osResult.result?.result?.summary ?? 'Mail server accepted the message.')
                        : String(osResult.result?.result?.summary ?? `Email not sent: ${osResult.result?.result?.error ?? status}`)
                    : `Action ${osResult.toolName} finished with status ${status ?? 'unknown'}.`;
          const userMsg = { id: crypto.randomUUID(), role: 'user', content, createdAt: new Date().toISOString() };
          const assistantMsg = { id: crypto.randomUUID(), role: 'assistant', content: summary, createdAt: new Date().toISOString() };
          setMessages((prev) => [...prev, userMsg, assistantMsg]);
          if (status === 'needs_confirmation' && osResult.result?.actionHash) {
            setPendingAction({ actionHash: osResult.result.actionHash, toolName: osResult.toolName, input: osResult.input });
          } else if (status === 'needs_read_back' && osResult.result?.actionHash) {
            setPendingAction({ actionHash: osResult.result.actionHash, toolName: osResult.toolName, input: osResult.input, readBackText: osResult.result.readBackText, pendingVoiceConfirmation: true });
          } else {
            setPendingAction(null);
          }
          if (speak) {
            const digestTools = new Set(['web.research', 'email.summarize', 'email.important', 'email.readAloud', 'email.listRecent']);
            if (digestTools.has(String(osResult.toolName))) void speakDigest(summary);
            else void speakReply(summary);
          }
          return;
        }
      } catch { /* fall through to normal chat */ }
      const userMsg = { id: crypto.randomUUID(), role: 'user', content, createdAt: new Date().toISOString() };
      setMessages((prev) => [...prev, userMsg]);
      const result: any = await window.companion.chatSendMessage(activeConvRef.current, content, speak ? 'voice' : 'text');
      setMessages((prev) => [...prev, { id: result.id, role: result.role, content: result.content, createdAt: result.createdAt }]);
      setConversations(await window.companion.chatListConversations());
      lastActivityRef.current = Date.now();
      if (speak) await speakReply(result.content);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      voiceProcessingRef.current = false;
      if (voiceModeRef.current && !speakingRef.current) {
        captureRef.current?.resume();
        setVoiceState('listening');
      }
    }
  }

  async function sendDraft() {
    if (!draft.trim()) return;
    const content = draft.trim();
    setDraft('');
    await sendMessage(content, false);
  }

  async function confirmPendingAction(): Promise<void> {
    if (!pendingAction) return;
    setBusy(true);
    try {
      const result: any = await window.companion.osConfirmTool(pendingAction.actionHash);
      const toolResult = result?.result?.result ?? result?.result;
      let summary = result?.confirmed
        ? `Confirmed ${pendingAction.toolName}: ${result.result?.status ?? 'unknown'}`
        : `Confirmation failed: ${result?.error ?? 'unknown error'}`;
      if (result?.confirmed && pendingAction.toolName === 'os.call') {
        summary = toolResult?.initiated
          ? `Dialer opened for ${toolResult.display ?? pendingAction.input?.number}. I cannot confirm the call connected.`
          : `Call did not start: ${toolResult?.error ?? 'unknown error'}`;
      }
      if (result?.confirmed && pendingAction.toolName === 'os.whatsappSend') {
        summary = toolResult?.sent || toolResult?.verified
          ? 'WhatsApp: typed and observed in the chat window. I am not claiming phone delivery.'
          : toolResult?.typed
            ? 'WhatsApp: typed, but I could not confirm it appeared in the chat.'
            : `WhatsApp: not sent. ${toolResult?.error ?? ''}`.trim();
      }
      if (result?.confirmed && pendingAction.toolName === 'email.send') {
        summary = toolResult?.sent
          ? String(toolResult?.summary ?? `Mail server accepted the message for ${pendingAction.input?.to}.`)
          : String(toolResult?.summary ?? `Email not sent. ${toolResult?.error ?? ''}`.trim());
      }
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: summary,
        createdAt: new Date().toISOString()
      }]);
      setPendingAction(null);
      await speakReply(summary);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rejectPendingAction(): Promise<void> {
    if (!pendingAction) return;
    try {
      await window.companion.osRejectTool(pendingAction.actionHash);
      setPendingAction(null);
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Cancelled. Nothing was sent or changed.',
        createdAt: new Date().toISOString()
      }]);
    } catch (e) {
      setError(String(e));
    }
  }

  async function enableCloudSpeech(): Promise<void> {
    const nextSettings = { ...voiceSettingsRef.current, cloudSpeechConsent: true };
    setVoiceSettings(nextSettings);
    voiceSettingsRef.current = nextSettings;
    setCloudConsentNeeded(false);
    await window.companion.voiceSetSettings(nextSettings);
    setStatus('Cloud speech enabled. Short clips are transcribed by Google Gemini; nothing is saved as an audio file.');
    await startListening();
  }

  async function startListening(): Promise<void> {
    if (!activeConvRef.current) {
      setVoiceError('Create or select a chat before starting live listening.');
      return;
    }
    if (mutedRef.current) {
      setVoiceError('Unmute before starting live listening.');
      return;
    }
    if (!windowFocusedRef.current && voiceSettingsRef.current?.listenWhenUnfocused !== true) {
      setVoiceError('Listening is paused while Companion is in the background. Enable “Listen when unfocused” in Voice settings or focus the window.');
      return;
    }
    setVoiceError('');
    setVoiceWarning('');
    setSpeechPrivacyNeeded(false);
    if (voiceSettingsRef.current?.cloudSpeechConsent !== true) {
      setCloudConsentNeeded(true);
      setVoiceState('off');
      setVoiceMode(false);
      voiceModeRef.current = false;
      setVoiceError('Speech needs your OK: short microphone clips are sent to Google Gemini for transcription. Raw audio is not stored on disk.');
      return;
    }
    setVoiceState('starting');
    try {
      await captureRef.current?.stop();
      const capture = new VoiceCapture({
        onSpeechStart: () => {
          if (!speakingRef.current) setInterimTranscript('Hearing you…');
        },
        onUtterance: (audio, mimeType) => {
          void (async () => {
            const bargeInAllowed = voiceSettingsRef.current?.bargeIn !== false;
            if (!voiceModeRef.current || voiceProcessingRef.current) return;
            // While speaking, only continue if barge-in is enabled (for stop words).
            if (speakingRef.current && !bargeInAllowed) return;
            if (!speakingRef.current && Date.now() < ignoreUntilRef.current) return;
            capture.pause();
            setVoiceState('processing');
            setInterimTranscript(speakingRef.current ? 'Checking interruption…' : 'Transcribing…');
            try {
              const result: any = await window.companion.voiceTranscribe(audio, mimeType);
              if (!result?.ok) {
                const err = String(result?.error || 'Speech transcription failed.');
                const busy = /503|UNAVAILABLE|high demand|provider_down|rate_limited|busy/i.test(err);
                setVoiceError(busy
                  ? 'Cloud speech is busy right now. Try again in a moment, or type instead.'
                  : err);
                setInterimTranscript('');
                if (voiceModeRef.current) {
                  capture.resume();
                  setVoiceState(speakingRef.current ? 'speaking' : 'listening');
                }
                return;
              }
              const text = String(result.text ?? '').trim();
              setInterimTranscript(text);
              if (!text || isNoiseTranscript(text)) {
                if (speakingRef.current) {
                  if (voiceModeRef.current) {
                    capture.resume();
                    setVoiceState('speaking');
                  }
                  return;
                }
                consecutiveNoiseRef.current += 1;
                if (consecutiveNoiseRef.current >= 5) {
                  consecutiveNoiseRef.current = 0;
                  setInterimTranscript('');
                  setVoiceWarning('Lots of background noise — I paused so I would not keep chatting with silence. Tap listen when you are ready.');
                  stopListening();
                  void speakReply('I am hearing mostly noise, so I paused listening. Tap listen when you want to talk.');
                  return;
                }
                if (voiceModeRef.current) {
                  capture.resume();
                  setVoiceState('listening');
                }
                return;
              }
              consecutiveNoiseRef.current = 0;
              await handleTranscriptRef.current(text);
            } catch (e) {
              setVoiceError(String(e));
              if (voiceModeRef.current) {
                capture.resume();
                setVoiceState('listening');
              }
            }
          })();
        },
        onError: (message) => {
          setVoiceError(message);
          setVoiceState('error');
        }
      });
      captureRef.current = capture;
      await capture.start();
      voiceModeRef.current = true;
      setVoiceMode(true);
      setVoiceState('listening');
      setVoiceEngine('gemini');
      setVoiceWarning('Live listening uses Google Gemini for transcription. Raw audio is not written to disk.');
    } catch (e) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      setVoiceState('error');
      const message = String(e);
      setVoiceError(message.includes('NotAllowedError') || message.includes('Permission')
        ? 'Microphone permission was denied. Allow the mic for Companion, then try again.'
        : message);
      setSpeechPrivacyNeeded(message.includes('NotAllowedError') || message.includes('Permission'));
    }
  }

  function stopListening(): void {
    voiceModeRef.current = false;
    voiceProcessingRef.current = false;
    setVoiceMode(false);
    setVoiceState('off');
    setInterimTranscript('');
    void captureRef.current?.stop();
    captureRef.current = null;
    void window.companion.voiceStop();
    void window.companion.voiceStopSpeaking();
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }

  async function handleTranscript(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text) return;
    const command = text.toLowerCase().replace(/[.!?,]+$/g, '').trim();
    if (!speakingRef.current && Date.now() < ignoreUntilRef.current && !command.startsWith('stop')) return;
    if (speakingRef.current) {
      const bargeInAllowed = voiceSettingsRef.current?.bargeIn !== false;
      const interrupt = ['stop', 'wait', 'be quiet', 'quiet', 'pause'].includes(command);
      if (!bargeInAllowed || !interrupt) return;
      await window.companion.voiceStopSpeaking();
      speakingRef.current = false;
      setSpeaking(false);
      setVoiceState(voiceModeRef.current ? 'listening' : 'off');
      return;
    }
    if (['stop listening', 'pause listening'].includes(command)) {
      stopListening();
      setInterimTranscript('');
      return;
    }
    if (voiceProcessingRef.current) return;
    setInterimTranscript('');
    if (guideActiveRef.current) {
      await submitVoiceGuideAnswer(text);
      return;
    }
    if (calibrationStepRef.current) {
      await handleCalibrationAnswer(text);
      return;
    }
    setVoiceState('processing');
    voiceProcessingRef.current = true;
    lastActivityRef.current = Date.now();
    await sendMessageRef.current(text, true, 'owner_voice');
  }

  async function handleCalibrationAnswer(answer: string): Promise<void> {
    const step = calibrationStepRef.current;
    if (!step) return;
    voiceProcessingRef.current = true;
    setVoiceState('processing');
    try {
      const result: any = await window.companion.personaCalibrationAnswer(step, answer);
      if (!result?.ok) throw new Error(result?.error || 'Calibration failed.');
      setPersona(result.state);
      const acknowledgment = String(result.acknowledgment || 'Got it.');
      setMessages((prev) => [...prev,
        { id: crypto.randomUUID(), role: 'user', content: answer, createdAt: new Date().toISOString() },
        { id: crypto.randomUUID(), role: 'assistant', content: acknowledgment, createdAt: new Date().toISOString() }
      ]);
      const next = result.next as { id: string; question: string } | null;
      if (next?.id) {
        calibrationStepRef.current = next.id;
        setCalibrationStep(next.id);
        setCalibrationQuestion(next.question);
        await speakReply(`${acknowledgment} ${next.question}`);
      } else {
        calibrationStepRef.current = null;
        setCalibrationStep(null);
        setCalibrationQuestion('');
        await speakReply(acknowledgment);
      }
    } catch (e) {
      setVoiceError(String(e));
    } finally {
      voiceProcessingRef.current = false;
      if (voiceModeRef.current) {
        captureRef.current?.resume();
        setVoiceState('listening');
      }
    }
  }

  useEffect(() => {
    const timer = setInterval(() => {
      void (async () => {
        if (!voiceSettings?.proactiveQuestions || mutedRef.current) return;
        if (!voiceModeRef.current || speakingRef.current || voiceProcessingRef.current || busy) return;
        if (!activeConvRef.current || !persona?.calibration?.completedAt) return;
        if (isQuietHours(new Date(), voiceSettings?.quietHours)) return;
        if (Date.now() - lastActivityRef.current < Math.max(1, Number(voiceSettings?.proactiveIdleMinutes ?? 8)) * 60_000) return;
        const today = new Date().toISOString().slice(0, 10);
        if (proactiveDayRef.current.day !== today) proactiveDayRef.current = { day: today, count: 0 };
        const cap = Math.max(0, Number(voiceSettings?.proactiveDailyCap ?? 3));
        if (proactiveDayRef.current.count >= cap) return;
        try {
          const result: any = await window.companion.personaProactive(activeConvRef.current, recentQuestionsRef.current);
          const question = typeof result?.question === 'string' ? result.question.trim() : '';
          if (!question) return;
          proactiveDayRef.current = { day: today, count: proactiveDayRef.current.count + 1 };
          try { localStorage.setItem('companion.proactive', JSON.stringify(proactiveDayRef.current)); } catch { /* ignore */ }
          recentQuestionsRef.current = [...recentQuestionsRef.current, question].slice(-12);
          if (result?.source === 'career' || result?.topic === 'career') {
            const alertId = `career-${today}`;
            setAlerts((prev) => {
              if (prev.some((a) => a.id === alertId)) return prev;
              return [...prev, {
                id: alertId,
                topic: 'career',
                message: question,
                reason: typeof result?.reason === 'string' ? result.reason : undefined,
                channel: 'spoken',
              }];
            });
          }
          setMessages((prev) => [...prev,
            { id: crypto.randomUUID(), role: 'assistant', content: question, createdAt: new Date().toISOString() }
          ]);
          lastActivityRef.current = Date.now();
          await speakReply(question);
        } catch { /* stay quiet if the proactive turn fails */ }
      })();
    }, 60_000);
    return () => clearInterval(timer);
  }, [voiceSettings, persona, muted, busy]);

  async function refreshProposed(): Promise<void> {
    try {
      const inbox: any = await window.companion.memoryListProposed();
      setProposed(Array.isArray(inbox) ? inbox : []);
    } catch { /* ignore */ }
  }

  async function refreshPermissions(): Promise<void> {
    try {
      const perms: any = await window.companion.permissionsList();
      setGrantable(Array.isArray(perms?.grantable) ? perms.grantable : []);
    } catch { /* ignore */ }
  }

  async function saveEmailConfig(): Promise<void> {
    setBusy(true);
    setEmailStatus('');
    try {
      const saved: any = await window.companion.emailSetConfig({
        host: emailForm.host,
        port: emailForm.port,
        user: emailForm.user,
        password: emailForm.password || undefined,
        tls: emailForm.tls,
      });
      setEmailForm((prev) => ({
        ...prev,
        password: '',
        configured: saved?.configured === true || Boolean(prev.user && prev.host),
        host: saved?.host ?? prev.host,
        port: Number(saved?.port) || prev.port,
        user: saved?.user ?? prev.user,
        tls: saved?.tls !== false,
      }));
      setEmailStatus(saved?.configured ? 'Email account saved. Password is in Windows Credential Manager.' : 'Saved. Add an app password to connect.');
    } catch (e) {
      setEmailStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function testEmailConfig(): Promise<void> {
    setBusy(true);
    setEmailStatus('Testing…');
    try {
      const result: any = await window.companion.emailTestConnection({
        host: emailForm.host,
        port: emailForm.port,
        user: emailForm.user,
        password: emailForm.password || undefined,
        tls: emailForm.tls,
      });
      setEmailStatus(result?.ok ? 'Connection succeeded.' : `Connection failed: ${result?.error ?? 'unknown'}`);
    } catch (e) {
      setEmailStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearEmailConfig(): Promise<void> {
    setBusy(true);
    try {
      await window.companion.emailClearConfig();
      setEmailForm({ host: 'imap.gmail.com', port: 993, user: '', password: '', tls: true, configured: false });
      setEmailStatus('Email disconnected.');
    } catch (e) {
      setEmailStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  function pendingSummary(): string {
    if (!pendingAction) return '';
    if (pendingAction.pendingVoiceConfirmation) {
      return pendingAction.readBackText || `Say "yes" to proceed with ${pendingAction.toolName}.`;
    }
    if (pendingAction.toolName === 'os.call') {
      return `Call ${pendingAction.input?.number}? This opens the dialer or Phone Link. I will not claim the call connected.`;
    }
    if (pendingAction.toolName === 'os.whatsappSend') {
      return `Message ${pendingAction.input?.contact}: “${pendingAction.input?.message}”. I only mark it sent if I observe it in the chat window.`;
    }
    if (pendingAction.toolName === 'email.send') {
      return `Send email to ${pendingAction.input?.to} — subject “${pendingAction.input?.subject}”. Nothing leaves this PC until you confirm.`;
    }
    if (pendingAction.toolName === 'os.run') {
      return `Run command: ${pendingAction.input?.command}. This can change your PC.`;
    }
    return `${pendingAction.toolName}: ${JSON.stringify(pendingAction.input)}`;
  }

  async function stopEverything(): Promise<void> {
    stopListening();
    try { await window.companion.chatAbort(); } catch { /* ignore */ }
    try { await window.companion.voiceStopSpeaking(); } catch { /* ignore */ }
    if (pendingAction) {
      try { await window.companion.osRejectTool(pendingAction.actionHash); } catch { /* ignore */ }
      setPendingAction(null);
    }
  }


  return (
    <div className="app-shell enterprise">
      <aside className={`sidebar ${navOpen ? '' : 'collapsed'}`}>
        <div className="brand">
          <span className="brand-mark">C</span>
          <div>
            <h2>Companion</h2>
            <p>Voice-first, on your PC</p>
          </div>
        </div>

        <nav className="nav" aria-label="Primary">
          <button className={tab === 'chat' ? 'nav-item active' : 'nav-item'} onClick={() => { setTab('chat'); setNavOpen(false); }}>
            Talk
          </button>
          <button className={tab === 'setup' ? 'nav-item active' : 'nav-item'} onClick={() => { setTab('setup'); setNavOpen(false); }}>
            Setup
          </button>
          <button className={tab === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => { setTab('settings'); setNavOpen(false); void refreshProposed(); void refreshPermissions(); }}>
            Settings
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
            <div className="eyebrow">Connected</div>
            {stored.map((id) => (
              <div key={id} className="provider-pill">{id}</div>
            ))}
          </div>
        )}

        <div className="sidebar-card sidebar-foot">
          <div className="eyebrow">Honesty</div>
          <p className="muted">I only claim OS actions I can observe — opens, plays, typed chats, accepted mail.</p>
        </div>
      </aside>

      <main className="main">
        <button className="mobile-nav-toggle ghost" onClick={() => setNavOpen((value) => !value)}>
          {navOpen ? 'Hide menu' : 'Menu'}
        </button>
        {error && <div className="banner error">{error}</div>}
        {status && <div className="banner success">{status}</div>}
        <AlertsRail
          alerts={alerts}
          onDismiss={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
          onSpeak={(message) => void speakDigest(message)}
        />

        {tab === 'setup' && (
          <div className="content-grid">
            <OnboardingHero
              guideActive={guideActive}
              voiceGuide={voiceGuide}
              guidePrompt={guidePrompt}
              guideAnswer={guideAnswer}
              busy={busy}
              speaking={speaking}
              voiceMode={voiceMode}
              muted={muted}
              hasProvider={stored.length > 0}
              onGuideAnswerChange={setGuideAnswer}
              onSubmitGuide={(answer) => void submitVoiceGuideAnswer(answer)}
              onStartVoiceOnboarding={() => void startVoiceOnboarding()}
              onStartTalking={() => setTab('chat')}
              onRunSystemCheck={() => void runOnboarding()}
              onStartListening={() => void startListening()}
              onStopListening={stopListening}
              onHearAgain={() => void speakReply(guidePrompt || getVoiceGuideStep(voiceGuide.currentStep).prompt)}
            />

            <section className="card">
              <div className="section-head">
                <h3>Onboarding state</h3>
                <span className="muted">
                  {guideActive
                    ? `Voice guide: ${getVoiceGuideStep(voiceGuide.currentStep).title}`
                    : onboarding?.currentStep ? `Current: ${onboarding.currentStep}` : onboarding?.completedAt || voiceGuide.completedAt ? 'Completed' : 'Not started'}
                </span>
              </div>
              <div className="saved-list">
                <div className="saved-item">
                  <span>Voice guide</span>
                  <span>{voiceGuide.completedAt ? 'Completed' : guideActive ? 'In progress' : 'Not started'}</span>
                </div>
                {(onboarding?.preset || voiceGuide.draft.privacyPreset) && (
                  <div className="saved-item">
                    <span>Privacy preset</span>
                    <span>{onboarding?.preset || voiceGuide.draft.privacyPreset}</span>
                  </div>
                )}
                {voiceGuide.draft.ownerName && (
                  <div className="saved-item">
                    <span>Owner</span>
                    <span>{voiceGuide.draft.ownerName}</span>
                  </div>
                )}
              </div>
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
                <h3>Add another provider</h3>
                <button className="ghost" onClick={() => setShowCustomProvider((value) => !value)}>{showCustomProvider ? 'Hide form' : 'Create new provider'}</button>
              </div>
              {!showCustomProvider ? <p className="muted">Add a provider that is not in the default list using any HTTPS OpenAI-compatible endpoint.</p> : <>
              <p className="muted">Companion stores only the API key in Windows Credential Manager.</p>
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
          <div className="talk-stage">
            <VoiceDock
              voiceMode={voiceMode}
              speaking={speaking}
              voiceState={voiceState}
              voiceEngine={voiceEngine}
              cloudConsentNeeded={cloudConsentNeeded}
              muted={muted}
              hasProvider={stored.length > 0}
              hasConversation={Boolean(activeConv)}
              interimTranscript={interimTranscript}
              calibrationQuestion={calibrationQuestion}
              calibrationStep={calibrationStep}
              voiceWarning={voiceWarning}
              voiceError={voiceError}
              speechPrivacyNeeded={speechPrivacyNeeded}
              onEnableCloudSpeech={() => void enableCloudSpeech()}
              onStartListening={() => void startListeningRef.current()}
              onStopListening={stopListening}
              onToggleMute={() => void toggleMute()}
              onStopEverything={() => void stopEverything()}
              onOpenMicSettings={() => void window.companion.openSettings('ms-settings:privacy-microphone')}
            />
            <ChatStage
              conversations={conversations}
              activeConv={activeConv}
              messages={messages}
              draft={draft}
              busy={busy}
              onDraftChange={setDraft}
              onSend={() => void sendDraft()}
              onNewConversation={() => void newConversation()}
              onLoadConversation={(id) => void loadConversation(id)}
              onDeleteConversation={(id) => void (async () => {
                await window.companion.chatDeleteConversation(id);
                setConversations(await window.companion.chatListConversations());
                if (activeConv === id) { setActiveConv(null); setMessages([]); }
              })()}
            />
            {pendingAction && (
              <ConfirmModal
                toolName={pendingAction.toolName}
                summary={pendingSummary()}
                busy={busy}
                onConfirm={() => void confirmPendingAction()}
                onReject={() => void rejectPendingAction()}
              />
            )}
          </div>
        )}

        {tab === 'settings' && (
          <SettingsShell
            section={settingsSection}
            onSection={setSettingsSection}
            voiceSettings={voiceSettings}
            voiceVoices={voiceVoices}
            onVoiceSettings={(next) => {
              setVoiceSettings(next);
              voiceSettingsRef.current = next;
              setCloudConsentNeeded(next.cloudSpeechConsent !== true);
            }}
            onSaveVoice={async () => {
              const saved: any = await window.companion.voiceSetSettings(voiceSettings);
              if (saved?.settings) {
                setVoiceSettings(saved.settings);
                voiceSettingsRef.current = saved.settings;
                setCloudConsentNeeded(saved.settings.cloudSpeechConsent !== true);
              }
              setStatus('Voice settings saved.');
            }}
            onTestVoice={() => void window.companion.voiceSpeak('This is how I will sound when I talk with you.')}
            persona={persona}
            calibrationQuestion={calibrationQuestion}
            onPersona={setPersona}
            onSavePersona={() => void savePersona(persona)}
            onBeginCalibration={() => void beginCalibration()}
            email={emailForm}
            emailStatus={emailStatus}
            onEmail={setEmailForm}
            onSaveEmail={() => void saveEmailConfig()}
            onTestEmail={() => void testEmailConfig()}
            onClearEmail={() => void clearEmailConfig()}
            proposed={proposed}
            onApproveMemory={async (id) => {
              await window.companion.memoryApprove(id);
              await refreshProposed();
              setStatus('Memory approved.');
            }}
            onRejectMemory={async (id) => {
              await window.companion.memoryReject(id);
              await refreshProposed();
              setStatus('Memory rejected.');
            }}
            onRefreshMemory={() => void refreshProposed()}
            owner={owner}
            onOwner={setOwner}
            onSaveOwner={async () => {
              await window.companion.memorySetOwner(owner);
              try { setProfile(await window.companion.memoryGetProfile()); } catch { /* ignore */ }
              setStatus('Owner profile saved.');
            }}
            grantable={grantable}
            onGrant={async (permission) => {
              await window.companion.permissionsGrant(permission);
              await refreshPermissions();
              setStatus(`Granted ${permission}. Class-3 actions still need confirmation.`);
            }}
            onExport={async () => {
              const result = await window.companion.privacyExport();
              setStatus(typeof result === 'object' ? 'Export complete.' : String(result));
            }}
            onDeleteAll={async () => {
              await window.companion.privacyDeleteAll();
              setStatus('Local companion data deleted.');
              await loadAll();
            }}
            onCheckUpdates={async () => {
              const infoUpdate: any = await window.companion.appCheckUpdates();
              setUpdateInfo(infoUpdate);
              setUpdateLabel(infoUpdate?.message || infoUpdate?.status || JSON.stringify(infoUpdate));
            }}
            updateLabel={updateLabel}
          >
            <div className="provider-detail">
              <p className="muted">Connected: {stored.length ? stored.join(', ') : 'none yet'}. Use Setup to add keys.</p>
              <button className="ghost" onClick={() => setTab('setup')}>Open Setup</button>
              <div className="actions">
                <button onClick={async () => { setAuditLogs(await window.companion.auditList()); }}>Load audit</button>
              </div>
              {auditLogs.length > 0 && <pre className="code-block">{JSON.stringify(auditLogs, null, 2)}</pre>}
              {profile && Object.keys(profile).length > 0 && (
                <>
                  <h4>Memory profile</h4>
                  <pre className="code-block">{JSON.stringify(profile, null, 2)}</pre>
                  <button onClick={async () => { await window.companion.memoryClearProfile(); setProfile({}); }}>Clear memory profile</button>
                </>
              )}
            </div>
          </SettingsShell>
        )}
      </main>
    </div>
  );
}
