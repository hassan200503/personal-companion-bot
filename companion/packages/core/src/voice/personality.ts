/**
 * Personality and persona engine.
 *
 * The companion keeps its own identity and judgment but speaks in the
 * owner's voice: their tone, rhythm, humour, directness and vocabulary.
 * This module turns a structured persona profile into system instructions,
 * runs the spoken calibration flow, and seeds proactive questions.
 */

export type PersonaTone = 'warm' | 'direct' | 'playful' | 'calm' | 'dry' | 'energetic' | 'custom';

export interface PersonaProfile {
  companionName: string;
  ownerName: string;
  pronunciation?: string;
  relationship?: string;
  tone: PersonaTone;
  toneDescription?: string;
  humor: number;
  energy: number;
  formality: number;
  verbosity: number;
  favoritePhrases: string[];
  avoidTopics: string[];
  values: string[];
  interests: string[];
  goals: string[];
  boundaries: string[];
  selfDescription?: string;
  askQuestions: boolean;
  proactiveDailyCap: number;
  updatedAt?: string;
}

export interface PersonaState {
  profile: PersonaProfile;
  learned: {
    toneNotes: string[];
    vocabulary: string[];
    topics: string[];
    updatedAt?: string;
  };
  calibration: {
    step: number;
    answers: Record<string, string>;
    startedAt?: string;
    completedAt?: string;
  };
}

export type CalibrationStepId = 'name' | 'tone' | 'boundaries';

export interface CalibrationStep {
  id: CalibrationStepId;
  question: string;
}

export const defaultPersonaProfile: PersonaProfile = {
  companionName: 'Companion',
  ownerName: '',
  tone: 'warm',
  humor: 0.5,
  energy: 0.55,
  formality: 0.4,
  verbosity: 0.4,
  favoritePhrases: [],
  avoidTopics: [],
  values: [],
  interests: [],
  goals: [],
  boundaries: [],
  askQuestions: true,
  proactiveDailyCap: 3
};

export const defaultPersonaState: PersonaState = {
  profile: defaultPersonaProfile,
  learned: { toneNotes: [], vocabulary: [], topics: [] },
  calibration: { step: 0, answers: {} }
};

function clamp01(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function cleanString(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function stringList(value: unknown, maxItems = 20, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = cleanString(item, maxLength);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

const tones: readonly PersonaTone[] = ['warm', 'direct', 'playful', 'calm', 'dry', 'energetic', 'custom'];

function normalizeTone(value: unknown, fallback: PersonaTone): PersonaTone {
  return tones.includes(value as PersonaTone) ? (value as PersonaTone) : fallback;
}

export function normalizePersonaProfile(raw: unknown): PersonaProfile {
  const record = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const ownerName = cleanString(record.ownerName ?? record.name, 80);
  return {
    companionName: cleanString(record.companionName, 40) || defaultPersonaProfile.companionName,
    ownerName,
    pronunciation: cleanString(record.pronunciation, 120) || undefined,
    relationship: cleanString(record.relationship, 120) || undefined,
    tone: normalizeTone(record.tone, defaultPersonaProfile.tone),
    toneDescription: cleanString(record.toneDescription, 400) || undefined,
    humor: clamp01(record.humor, defaultPersonaProfile.humor),
    energy: clamp01(record.energy, defaultPersonaProfile.energy),
    formality: clamp01(record.formality, defaultPersonaProfile.formality),
    verbosity: clamp01(record.verbosity, defaultPersonaProfile.verbosity),
    favoritePhrases: stringList(record.favoritePhrases),
    avoidTopics: stringList(record.avoidTopics),
    values: stringList(record.values),
    interests: stringList(record.interests),
    goals: stringList(record.goals),
    boundaries: stringList(record.boundaries),
    selfDescription: cleanString(record.selfDescription, 1200) || undefined,
    askQuestions: record.askQuestions !== false,
    proactiveDailyCap: Math.max(0, Math.min(12, Math.round(Number(record.proactiveDailyCap ?? defaultPersonaProfile.proactiveDailyCap) || 0))),
    updatedAt: cleanString(record.updatedAt, 40) || undefined
  };
}

export function normalizePersonaState(raw: unknown): PersonaState {
  const record = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const learnedRecord = record.learned !== null && typeof record.learned === 'object' ? record.learned as Record<string, unknown> : {};
  const calibrationRecord = record.calibration !== null && typeof record.calibration === 'object' ? record.calibration as Record<string, unknown> : {};
  const answersRecord = calibrationRecord.answers !== null && typeof calibrationRecord.answers === 'object' ? calibrationRecord.answers as Record<string, unknown> : {};
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(answersRecord)) {
    const text = cleanString(value, 1200);
    if (text) answers[key] = text;
  }
  return {
    profile: normalizePersonaProfile(record.profile),
    learned: {
      toneNotes: stringList(learnedRecord.toneNotes, 20, 160),
      vocabulary: stringList(learnedRecord.vocabulary, 60, 60),
      topics: stringList(learnedRecord.topics, 60, 80),
      updatedAt: cleanString(learnedRecord.updatedAt, 40) || undefined
    },
    calibration: {
      step: Math.max(0, Math.min(10, Math.round(Number(calibrationRecord.step) || 0))),
      answers,
      startedAt: cleanString(calibrationRecord.startedAt, 40) || undefined,
      completedAt: cleanString(calibrationRecord.completedAt, 40) || undefined
    }
  };
}

export function mergePersonaState(current: PersonaState, patch: unknown): PersonaState {
  const normalizedCurrent = normalizePersonaState(current);
  const record = patch !== null && typeof patch === 'object' ? patch as Record<string, unknown> : {};
  const merged = normalizePersonaState({
    profile: { ...normalizedCurrent.profile, ...(record.profile && typeof record.profile === 'object' ? record.profile : {}) },
    learned: { ...normalizedCurrent.learned, ...(record.learned && typeof record.learned === 'object' ? record.learned : {}) },
    calibration: { ...normalizedCurrent.calibration, ...(record.calibration && typeof record.calibration === 'object' ? record.calibration : {}) }
  });
  return normalizedCurrent.profile.updatedAt === merged.profile.updatedAt
    ? merged
    : { ...merged, profile: { ...merged.profile, updatedAt: new Date().toISOString() } };
}

function describeHumor(value: number): string {
  if (value < 0.25) return 'rarely jokes; keeps things plain';
  if (value < 0.5) return 'dry, understated humour';
  if (value < 0.75) return 'warm and occasionally playful';
  return 'playful, laughs easily and teases affectionately';
}

function describeEnergy(value: number): string {
  if (value < 0.3) return 'low-key and unhurried';
  if (value < 0.65) return 'steady and relaxed';
  return 'energetic and quick';
}

function describeFormality(value: number): string {
  if (value < 0.3) return 'casual, like a close friend';
  if (value < 0.65) return 'relaxed but clear';
  return 'polished and careful';
}

function describeVerbosity(value: number): string {
  if (value < 0.3) return 'short and punchy';
  if (value < 0.65) return 'brief but complete';
  return 'detailed and thorough when it matters';
}

export function describePersonality(profile: PersonaProfile): string {
  const tone = profile.toneDescription || profile.tone;
  return [
    `Tone: ${tone}.`,
    `Humour: ${describeHumor(profile.humor)}.`,
    `Energy: ${describeEnergy(profile.energy)}.`,
    `Register: ${describeFormality(profile.formality)}.`,
    `Length: ${describeVerbosity(profile.verbosity)}.`
  ].join(' ');
}

export interface PersonaPromptOptions {
  modality?: 'voice' | 'text';
  situation?: string;
  memories?: readonly string[];
  streaming?: boolean;
}

/**
 * Builds the persistent instruction block. Kept deterministic so the same
 * character survives provider failover and app restarts.
 */
export function buildPersonaPrompt(state: PersonaState, options: PersonaPromptOptions = {}): string {
  const normalized = normalizePersonaState(state);
  const profile = normalized.profile;
  const ownerName = profile.ownerName || 'the owner';
  const companionName = profile.companionName || 'Companion';
  const voice = options.modality !== 'text';
  const favoritePhrases = profile.favoritePhrases.length ? profile.favoritePhrases.join(', ') : 'none listed';
  const avoid = profile.avoidTopics.length ? profile.avoidTopics.join('; ') : 'none stated';
  const values = profile.values.length ? profile.values.join('; ') : 'not stated';
  const interests = profile.interests.length ? profile.interests.join('; ') : 'not stated';
  const goals = profile.goals.length ? profile.goals.join('; ') : 'not stated';
  const boundaries = profile.boundaries.length ? profile.boundaries.join('; ') : 'none stated';
  const learnedNotes = normalized.learned.toneNotes.length ? normalized.learned.toneNotes.join('; ') : 'none yet';
  const learnedWords = normalized.learned.vocabulary.length ? normalized.learned.vocabulary.join(', ') : 'none yet';
  const learnedTopics = normalized.learned.topics.length ? normalized.learned.topics.join('; ') : 'none yet';
  const memories = (options.memories ?? []).filter(Boolean).slice(0, 12);

  const lines = [
    `You are ${companionName}, ${ownerName}'s personal companion.`,
    'You have your own intelligence, curiosity, continuity and judgment. You are not a generic assistant, and you are not a transcript of the owner.',
    `You speak in ${ownerName}'s voice and personality so naturally that the owner recognises themselves in your phrasing.`,
    profile.selfDescription ? `How ${ownerName} describes their own way of talking: ${profile.selfDescription}` : '',
    `Personality: ${describePersonality(profile)}`,
    profile.relationship ? `Relationship: ${profile.relationship}.` : '',
    `Words and phrases they use: ${favoritePhrases}.`,
    `Values: ${values}.`,
    `Interests: ${interests}.`,
    `Current goals: ${goals}.`,
    `Never bring up or joke about: ${avoid}.`,
    `Boundaries: ${boundaries}.`,
    `Observed style notes: ${learnedNotes}.`,
    `Observed vocabulary: ${learnedWords}.`,
    `Recent topics: ${learnedTopics}.`,
    memories.length ? `Approved memories:\n${memories.map((memory) => `- ${memory}`).join('\n')}` : '',
    options.situation ? `Right now: ${options.situation}` : '',
    'Rules of character:',
    '- Be honest that you are an AI when asked directly. Never claim to be human, sentient, or physically present, and never invent feelings you do not have.',
    '- You may disagree, have opinions and show curiosity. You are not a yes-machine.',
    '- Match the owner\'s rhythm, directness and vocabulary. Do not sand off their edge, humour or warmth.',
    '- Never impersonate the owner to other people or send messages as them.',
    '- Never claim an action is complete without evidence.',
    '- Ask at most one question at a time. A good question is short, specific and genuinely curious. Never interrogate.',
    '- Keep private details out of spoken replies: third-party names, message contents, amounts, addresses and credentials stay in the text log. Say that something needs attention instead.',
    voice
      ? '- This turn is spoken. Reply in one to three short, natural sentences. No markdown, lists, tables, emojis, code blocks or URLs. Read numbers and abbreviations the way a person would say them. Put detail in the text channel, not in the air.'
      : '- This turn is typed. You may be more detailed, but stay in the same voice.',
    '- Prefer plain words over corporate language. Never use phrases like "I understand your concern" or "As an AI language model".',
    profile.askQuestions
      ? '- When something genuinely sparks your curiosity, or you need one detail to help, ask. When the owner seems done, do not fill silence.'
      : '- Do not initiate questions unless the owner asks you to.'
  ];
  return lines.filter(Boolean).join('\n');
}

export interface ProactiveContext {
  now: Date;
  recentConversation?: readonly string[];
  recentQuestions?: readonly string[];
  seed?: string;
}

export function buildProactiveQuestionPrompt(state: PersonaState, context: ProactiveContext): string {
  const persona = buildPersonaPrompt(state, { modality: 'voice' });
  const recent = (context.recentConversation ?? []).slice(-8).map((line) => `- ${line.slice(0, 240)}`).join('\n') || '- none yet';
  const asked = (context.recentQuestions ?? []).slice(-12).map((line) => `- ${line}`).join('\n') || '- none';
  return [
    persona,
    '',
    'Task: ask the owner one short, genuinely curious question, as yourself, in their voice.',
    'The question must be one sentence, at most 20 words, speakable, specific and not repetitive.',
    'Do not greet, do not explain, do not add quotation marks. Only the question.',
    'Never ask for passwords, money, private third-party details or anything that would embarrass the owner if overheard.',
    context.seed ? `Optional direction: ${context.seed}` : '',
    '',
    'Recent conversation:',
    recent,
    '',
    'Questions already asked (do not repeat or paraphrase):',
    asked
  ].filter(Boolean).join('\n');
}

const proactiveSeeds = [
  'What is the one thing you want to get done today?',
  'What has been on your mind the most today?',
  'What went better than you expected today?',
  'What are you looking forward to this week?',
  'What is something small that would make today easier?',
  'What have you been avoiding that you could start in five minutes?',
  'What did you learn recently that surprised you?',
  'Who or what made you smile today?',
  'What would make this evening feel like a good one?',
  'What is one thing you want to remember about today?'
] as const;

export function fallbackProactiveQuestion(state: PersonaState, context: ProactiveContext): string {
  const normalized = normalizePersonaState(state);
  const recent = new Set((context.recentQuestions ?? []).map((question) => question.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()));
  const goal = normalized.profile.goals[0];
  const interest = normalized.profile.interests[0];
  const candidates: string[] = [];
  const hour = context.now.getHours();
  if (goal) candidates.push(`How is ${goal.replace(/\.$/, '')} going?`);
  if (interest && hour >= 9 && hour < 18) candidates.push(`What is the latest with ${interest.replace(/\.$/, '')}?`);
  if (hour < 12) candidates.push('What is the one thing you want to get done today?');
  if (hour >= 12 && hour < 18) candidates.push('How is the day treating you so far?');
  if (hour >= 18) candidates.push('What went well today?');
  candidates.push(...proactiveSeeds);
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (!recent.has(key)) return candidate;
  }
  return 'What is something you have been thinking about lately?';
}

export const calibrationSteps: readonly CalibrationStep[] = [
  { id: 'name', question: 'Before we start, what should I call you?' },
  { id: 'tone', question: 'How do you usually talk? Tell me in your own words: warm or direct, playful or dry, slow or quick.' },
  { id: 'boundaries', question: 'Is there anything you never want me to bring up or joke about?' }
] as const;

export function nextCalibrationStep(state: PersonaState): CalibrationStep | null {
  const normalized = normalizePersonaState(state);
  if (normalized.calibration.completedAt) return null;
  for (const step of calibrationSteps) {
    if (step.id === 'name' && normalized.profile.ownerName) continue;
    if (step.id === 'tone' && normalized.profile.selfDescription) continue;
    if (step.id === 'boundaries' && normalized.calibration.answers.boundaries) continue;
    return step;
  }
  return null;
}

function inferTone(answer: string): PersonaTone {
  const lower = answer.toLowerCase();
  if (/\b(playful|funny|joke|tease|laugh)\b/.test(lower)) return 'playful';
  if (/\b(direct|blunt|straight|no nonsense|say it)\b/.test(lower)) return 'direct';
  if (/\b(calm|steady|gentle|slow|soft)\b/.test(lower)) return 'calm';
  if (/\b(dry|deadpan|sarcastic|witty)\b/.test(lower)) return 'dry';
  if (/\b(energy|energetic|quick|fast|excited)\b/.test(lower)) return 'energetic';
  return 'warm';
}

function parseBoundaryList(answer: string): string[] {
  const cleaned = answer.replace(/^(nothing|no|nope|not really)[.!]?$/i, '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/\s*(?:,|;|\band\b|\bor\b)\s*/i)
    .map((part) => part.replace(/^(please\s+(don't|do not|never)\s+|never\s+|don't\s+|do not\s+)/i, '').trim())
    .filter((part) => part.length > 1 && part.length < 120)
    .slice(0, 12);
}

function parseNameAnswer(answer: string): string {
  return answer
    .replace(/^(my name is|i am|i'm|call me|it's|its)\s+/i, '')
    .replace(/[.!?]+$/g, '')
    .trim()
    .slice(0, 80);
}

export interface CalibrationResult {
  state: PersonaState;
  step: CalibrationStepId | 'complete';
  acknowledgment: string;
  next: CalibrationStep | null;
}

export function applyCalibrationAnswer(state: PersonaState, stepId: CalibrationStepId, answer: string, now: Date = new Date()): CalibrationResult {
  const normalized = normalizePersonaState(state);
  const text = cleanString(answer, 1200);
  const iso = now.toISOString();
  const profile = { ...normalized.profile };
  const calibration = {
    ...normalized.calibration,
    answers: { ...normalized.calibration.answers, [stepId]: text },
    startedAt: normalized.calibration.startedAt ?? iso
  };
  let acknowledgment: string;
  if (stepId === 'name') {
    const name = parseNameAnswer(text);
    if (name) profile.ownerName = name;
    acknowledgment = name ? `Good to meet you, ${name}.` : 'No problem, I will just call you friend.';
  } else if (stepId === 'tone') {
    profile.selfDescription = text || profile.selfDescription;
    profile.tone = inferTone(text);
    profile.toneDescription = text || profile.toneDescription;
    acknowledgment = text ? 'Got it. I will match that.' : 'That is fine. I will keep it simple.';
  } else {
    const boundaries = parseBoundaryList(text);
    profile.avoidTopics = boundaries.length ? Array.from(new Set([...profile.avoidTopics, ...boundaries])) : profile.avoidTopics;
    acknowledgment = boundaries.length ? 'Understood. I will steer clear of that.' : 'Good to know. I will not pry.';
  }
  profile.updatedAt = iso;
  const candidate: PersonaState = {
    profile,
    learned: normalized.learned,
    calibration
  };
  const next = nextCalibrationStep(candidate);
  const completedAt = next ? undefined : iso;
  return {
    state: {
      ...candidate,
      calibration: { ...candidate.calibration, step: next ? candidate.calibration.step + 1 : calibrationSteps.length, completedAt }
    },
    step: next ? stepId : 'complete',
    acknowledgment: next ? acknowledgment : `${acknowledgment} That is everything I needed.`,
    next
  };
}

export function isPersonaCalibrated(state: PersonaState): boolean {
  return Boolean(normalizePersonaState(state).calibration.completedAt);
}
