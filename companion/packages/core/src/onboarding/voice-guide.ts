/**
 * Voice-guided first-run onboarding.
 *
 * The companion speaks each step, collects owner personal details and
 * bot preferences, and can accept spoken or typed answers.
 */

export type VoiceGuideStepId =
  | 'welcome'
  | 'owner_name'
  | 'owner_phone'
  | 'owner_dob'
  | 'companion_name'
  | 'tone'
  | 'boundaries'
  | 'privacy_preset'
  | 'cloud_speech'
  | 'provider'
  | 'complete';

export type PrivacyPresetChoice = 'recommended' | 'privacy-first' | 'minimal';

export interface VoiceGuideDraft {
  ownerName: string;
  ownerPhone: string;
  ownerDob: string;
  companionName: string;
  toneDescription: string;
  tone: 'warm' | 'direct' | 'playful' | 'calm' | 'dry' | 'energetic' | 'custom';
  avoidTopics: string[];
  privacyPreset: PrivacyPresetChoice;
  cloudSpeechConsent: boolean;
  providerConnected: boolean;
}

export interface VoiceGuideStep {
  id: VoiceGuideStepId;
  title: string;
  prompt: string;
  hint: string;
  optional?: boolean;
  /** Steps that only advance after an external action (provider key). */
  awaitsAction?: boolean;
}

export interface VoiceGuideProgress {
  completedAt?: string;
  currentStep: VoiceGuideStepId;
  draft: VoiceGuideDraft;
  startedAt?: string;
}

export const defaultVoiceGuideDraft: VoiceGuideDraft = {
  ownerName: '',
  ownerPhone: '',
  ownerDob: '',
  companionName: 'Companion',
  toneDescription: '',
  tone: 'warm',
  avoidTopics: [],
  privacyPreset: 'recommended',
  cloudSpeechConsent: false,
  providerConnected: false
};

export const voiceGuideSteps: readonly VoiceGuideStep[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    prompt: 'Hi. I am your Companion on this PC. I will guide you through setup by voice. You can answer out loud once speech is enabled, or type at any time. Say continue when you are ready.',
    hint: 'Say “continue” or press Continue'
  },
  {
    id: 'owner_name',
    title: 'Your name',
    prompt: 'What should I call you?',
    hint: 'Your preferred name'
  },
  {
    id: 'owner_phone',
    title: 'Phone',
    prompt: 'If you want, tell me your phone number so I can use it for calls later. Or say skip.',
    hint: 'Phone number, or skip',
    optional: true
  },
  {
    id: 'owner_dob',
    title: 'Birthday',
    prompt: 'Optional: what is your date of birth? Or say skip.',
    hint: 'Date of birth, or skip',
    optional: true
  },
  {
    id: 'companion_name',
    title: 'My name',
    prompt: 'What would you like to call me? Companion is fine, or choose another name.',
    hint: 'Name for the bot'
  },
  {
    id: 'tone',
    title: 'How I should talk',
    prompt: 'How should I talk with you? Warm or direct, playful or calm, short answers or fuller ones. Describe it in your own words.',
    hint: 'Tone and style preference'
  },
  {
    id: 'boundaries',
    title: 'Boundaries',
    prompt: 'Is there anything you never want me to bring up or joke about? Say nothing if you are fine.',
    hint: 'Topics to avoid, or nothing'
  },
  {
    id: 'privacy_preset',
    title: 'Privacy preset',
    prompt: 'Choose a privacy preset. Say recommended for balanced defaults, privacy first for stricter approvals, or minimal for fewer background features.',
    hint: 'recommended · privacy first · minimal'
  },
  {
    id: 'cloud_speech',
    title: 'Cloud speech',
    prompt: 'To hear you, I need permission to send short microphone clips to Google Gemini for transcription. Raw audio is not saved on this PC. Say yes to enable cloud speech, or no to type for now.',
    hint: 'yes or no'
  },
  {
    id: 'provider',
    title: 'Connect Gemini',
    prompt: 'Next, paste a Google Gemini API key in the provider form so I can think and transcribe. When it is saved, say continue.',
    hint: 'Save a Gemini key, then continue',
    awaitsAction: true
  },
  {
    id: 'complete',
    title: 'Ready',
    prompt: 'Setup is complete. I know your preferences and I am ready to talk. Say open chat when you want to begin.',
    hint: 'Say open chat or press Finish'
  }
] as const;

export function createVoiceGuideProgress(partial?: Partial<VoiceGuideProgress>): VoiceGuideProgress {
  return {
    currentStep: partial?.currentStep ?? 'welcome',
    draft: { ...defaultVoiceGuideDraft, ...(partial?.draft ?? {}) },
    startedAt: partial?.startedAt,
    completedAt: partial?.completedAt
  };
}

export function normalizeVoiceGuideProgress(raw: unknown): VoiceGuideProgress {
  const record = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const draftRaw = record.draft !== null && typeof record.draft === 'object' ? record.draft as Record<string, unknown> : {};
  const step = voiceGuideSteps.some((entry) => entry.id === record.currentStep)
    ? record.currentStep as VoiceGuideStepId
    : 'welcome';
  const tone = ['warm', 'direct', 'playful', 'calm', 'dry', 'energetic', 'custom'].includes(String(draftRaw.tone))
    ? draftRaw.tone as VoiceGuideDraft['tone']
    : 'warm';
  const preset = ['recommended', 'privacy-first', 'minimal'].includes(String(draftRaw.privacyPreset))
    ? draftRaw.privacyPreset as PrivacyPresetChoice
    : 'recommended';
  return createVoiceGuideProgress({
    currentStep: step,
    startedAt: typeof record.startedAt === 'string' ? record.startedAt : undefined,
    completedAt: typeof record.completedAt === 'string' ? record.completedAt : undefined,
    draft: {
      ownerName: clean(draftRaw.ownerName, 80),
      ownerPhone: clean(draftRaw.ownerPhone, 40),
      ownerDob: clean(draftRaw.ownerDob, 40),
      companionName: clean(draftRaw.companionName, 40) || 'Companion',
      toneDescription: clean(draftRaw.toneDescription, 1200),
      tone,
      avoidTopics: Array.isArray(draftRaw.avoidTopics)
        ? draftRaw.avoidTopics.map((item) => clean(item, 120)).filter(Boolean).slice(0, 12)
        : [],
      privacyPreset: preset,
      cloudSpeechConsent: draftRaw.cloudSpeechConsent === true,
      providerConnected: draftRaw.providerConnected === true
    }
  });
}

export function getVoiceGuideStep(id: VoiceGuideStepId): VoiceGuideStep {
  return voiceGuideSteps.find((step) => step.id === id) ?? voiceGuideSteps[0]!;
}

export function voiceGuideStepIndex(id: VoiceGuideStepId): number {
  return Math.max(0, voiceGuideSteps.findIndex((step) => step.id === id));
}

export function isVoiceGuideComplete(progress: VoiceGuideProgress): boolean {
  return Boolean(progress.completedAt);
}

export function needsVoiceGuide(progress: VoiceGuideProgress, ownerName?: string): boolean {
  if (progress.completedAt) return false;
  if (progress.startedAt) return true;
  return !clean(ownerName, 80);
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function isSkip(answer: string): boolean {
  return /^(skip|no|none|nothing|nope|pass|later|n\/a|na)$/i.test(answer.trim());
}

function isContinue(answer: string): boolean {
  return /^(continue|next|ok|okay|yes|yeah|yep|ready|sure|go|start|begin|open chat|finish|done)$/i.test(answer.trim());
}

function parseName(answer: string): string {
  return answer
    .replace(/^(my name is|i am|i'm|call me|it's|its|name me)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim()
    .slice(0, 80);
}

function parsePhone(answer: string): string {
  const digits = answer.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 7) return '';
  return digits.slice(0, 20);
}

function inferTone(answer: string): VoiceGuideDraft['tone'] {
  const lower = answer.toLowerCase();
  if (/\b(playful|funny|joke|tease|laugh)\b/.test(lower)) return 'playful';
  if (/\b(direct|blunt|straight|no nonsense|say it)\b/.test(lower)) return 'direct';
  if (/\b(calm|steady|gentle|slow|soft)\b/.test(lower)) return 'calm';
  if (/\b(dry|deadpan|sarcastic|witty)\b/.test(lower)) return 'dry';
  if (/\b(energy|energetic|quick|fast|excited)\b/.test(lower)) return 'energetic';
  return 'warm';
}

function parseBoundaries(answer: string): string[] {
  if (isSkip(answer) || /^(nothing|no|none|i'm fine|im fine|all good)$/i.test(answer.trim())) return [];
  return answer
    .split(/\s*(?:,|;|\band\b|\bor\b)\s*/i)
    .map((part) => part.replace(/^(please\s+(don't|do not|never)\s+|never\s+|don't\s+|do not\s+)/i, '').trim())
    .filter((part) => part.length > 1 && part.length < 120)
    .slice(0, 12);
}

function parsePreset(answer: string): PrivacyPresetChoice | null {
  const lower = answer.toLowerCase();
  if (/\bprivacy[\s-]*first\b|\bstrict\b|\bprivate\b/.test(lower)) return 'privacy-first';
  if (/\bminimal\b|\bbasic\b|\bsimple\b/.test(lower)) return 'minimal';
  if (/\brecommended\b|\bdefault\b|\bbalanced\b|\bnormal\b/.test(lower)) return 'recommended';
  return null;
}

function parseYesNo(answer: string): boolean | null {
  const lower = answer.toLowerCase().replace(/[.!?]+$/g, '').trim();
  if (/^(yes|yeah|yep|sure|ok|okay|enable|allow|agree|i agree)$/.test(lower)) return true;
  if (/^(no|nope|not now|later|deny|disagree|type)$/.test(lower)) return false;
  return null;
}

export interface VoiceGuideAdvanceResult {
  progress: VoiceGuideProgress;
  acknowledgment: string;
  prompt: string;
  done: boolean;
  error?: string;
}

function nextStepId(current: VoiceGuideStepId): VoiceGuideStepId | null {
  const index = voiceGuideStepIndex(current);
  const next = voiceGuideSteps[index + 1];
  return next ? next.id : null;
}

export function advanceVoiceGuide(
  progress: VoiceGuideProgress,
  answer: string,
  options?: { providerConnected?: boolean; now?: Date }
): VoiceGuideAdvanceResult {
  const now = options?.now ?? new Date();
  const iso = now.toISOString();
  const text = clean(answer, 1200);
  const draft = { ...progress.draft };
  if (options?.providerConnected === true) draft.providerConnected = true;

  const startedAt = progress.startedAt ?? iso;
  const step = getVoiceGuideStep(progress.currentStep);
  let acknowledgment = 'Got it.';
  let error: string | undefined;

  switch (step.id) {
    case 'welcome':
      if (!isContinue(text) && text.length > 0 && !/^hi|hello|hey/.test(text.toLowerCase())) {
        // Still allow any short acknowledgment.
      }
      acknowledgment = 'Great. Let’s set up your profile.';
      break;
    case 'owner_name': {
      const name = parseName(text);
      if (!name) {
        return {
          progress: { ...progress, startedAt, draft },
          acknowledgment: '',
          prompt: step.prompt,
          done: false,
          error: 'Please tell me your name.'
        };
      }
      draft.ownerName = name;
      acknowledgment = `Good to meet you, ${name}.`;
      break;
    }
    case 'owner_phone': {
      if (isSkip(text) || !text) {
        draft.ownerPhone = '';
        acknowledgment = 'No problem. We can add a number later.';
      } else {
        const phone = parsePhone(text);
        if (!phone) {
          return {
            progress: { ...progress, startedAt, draft },
            acknowledgment: '',
            prompt: step.prompt,
            done: false,
            error: 'That did not look like a phone number. Try again, or say skip.'
          };
        }
        draft.ownerPhone = phone;
        acknowledgment = 'Saved your phone number for later call requests.';
      }
      break;
    }
    case 'owner_dob': {
      if (isSkip(text) || !text) {
        draft.ownerDob = '';
        acknowledgment = 'Skipped. Moving on.';
      } else {
        draft.ownerDob = text.slice(0, 40);
        acknowledgment = 'Got your birthday.';
      }
      break;
    }
    case 'companion_name': {
      const name = parseName(text) || 'Companion';
      draft.companionName = name;
      acknowledgment = `I’ll answer to ${name}.`;
      break;
    }
    case 'tone': {
      if (!text) {
        return {
          progress: { ...progress, startedAt, draft },
          acknowledgment: '',
          prompt: step.prompt,
          done: false,
          error: 'Tell me how you want me to talk.'
        };
      }
      draft.toneDescription = text;
      draft.tone = inferTone(text);
      acknowledgment = 'Understood. I will match that style.';
      break;
    }
    case 'boundaries': {
      draft.avoidTopics = parseBoundaries(text || 'nothing');
      acknowledgment = draft.avoidTopics.length
        ? 'I will steer clear of those topics.'
        : 'No hard boundaries noted.';
      break;
    }
    case 'privacy_preset': {
      const preset = parsePreset(text) ?? (isContinue(text) ? 'recommended' : null);
      if (!preset) {
        return {
          progress: { ...progress, startedAt, draft },
          acknowledgment: '',
          prompt: step.prompt,
          done: false,
          error: 'Please say recommended, privacy first, or minimal.'
        };
      }
      draft.privacyPreset = preset;
      acknowledgment = `Using the ${preset} preset.`;
      break;
    }
    case 'cloud_speech': {
      const consent = parseYesNo(text);
      if (consent === null) {
        return {
          progress: { ...progress, startedAt, draft },
          acknowledgment: '',
          prompt: step.prompt,
          done: false,
          error: 'Please say yes to enable cloud speech, or no to type for now.'
        };
      }
      draft.cloudSpeechConsent = consent;
      acknowledgment = consent
        ? 'Cloud speech is on. Short clips go to Gemini; nothing is saved as an audio file.'
        : 'Okay. You can type, and enable cloud speech later in Voice settings.';
      break;
    }
    case 'provider': {
      if (!draft.providerConnected && options?.providerConnected !== true) {
        return {
          progress: { ...progress, startedAt, draft },
          acknowledgment: '',
          prompt: step.prompt,
          done: false,
          error: 'Save a Gemini API key first, then say continue.'
        };
      }
      draft.providerConnected = true;
      acknowledgment = 'Provider connected.';
      break;
    }
    case 'complete':
      acknowledgment = 'Welcome aboard.';
      return {
        progress: {
          currentStep: 'complete',
          draft,
          startedAt,
          completedAt: iso
        },
        acknowledgment,
        prompt: '',
        done: true
      };
    default:
      error = 'Unknown setup step.';
  }

  if (error) {
    return { progress: { ...progress, startedAt, draft }, acknowledgment: '', prompt: step.prompt, done: false, error };
  }

  const next = nextStepId(step.id);
  if (!next) {
    return {
      progress: { currentStep: 'complete', draft, startedAt, completedAt: iso },
      acknowledgment,
      prompt: '',
      done: true
    };
  }

  const nextPrompt = getVoiceGuideStep(next).prompt
    .replace(/\bCompanion\b/g, draft.companionName || 'Companion');

  return {
    progress: { currentStep: next, draft, startedAt, completedAt: undefined },
    acknowledgment,
    prompt: nextPrompt,
    done: false
  };
}

export function speakableGuideLine(acknowledgment: string, prompt: string): string {
  return [acknowledgment, prompt].map((part) => part.trim()).filter(Boolean).join(' ');
}
