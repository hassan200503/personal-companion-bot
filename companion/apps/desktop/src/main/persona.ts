import {
  applyCalibrationAnswer,
  buildPersonaPrompt,
  buildProactiveQuestionPrompt,
  fallbackProactiveQuestion,
  nextCalibrationStep,
  normalizePersonaState,
  type CalibrationResult,
  type CalibrationStepId,
  type CompanionDatabase,
  type PersonaPromptOptions,
  type PersonaState,
  type ProviderRouter
} from '@companion/core';

const personaKey = 'persona.state';

function readSetting(database: CompanionDatabase | null, key: string): unknown {
  if (!database) return undefined;
  try {
    const row = database.raw.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ? JSON.parse(row.value) : undefined;
  } catch {
    return undefined;
  }
}

function writeSetting(database: CompanionDatabase | null, key: string, value: unknown): void {
  if (!database) return;
  database.raw.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

function ownerProfile(database: CompanionDatabase | null): Record<string, unknown> {
  const owner = readSetting(database, 'owner.profile');
  return owner !== null && typeof owner === 'object' ? owner as Record<string, unknown> : {};
}

function memoryNotes(database: CompanionDatabase | null): string[] {
  const profile = readSetting(database, 'memory.profile');
  if (profile === null || typeof profile !== 'object') return [];
  const notes = (profile as Record<string, unknown>).notes;
  if (!Array.isArray(notes)) return [];
  return notes
    .map((note) => {
      if (typeof note === 'string') return note;
      if (note !== null && typeof note === 'object') return String((note as Record<string, unknown>).note ?? '');
      return '';
    })
    .map((note) => note.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function loadPersonaState(database: CompanionDatabase | null): PersonaState {
  const stored = normalizePersonaState(readSetting(database, personaKey));
  const owner = ownerProfile(database);
  const name = typeof owner.name === 'string' ? owner.name.trim() : '';
  if (!name || stored.profile.ownerName) return stored;
  return {
    ...stored,
    profile: { ...stored.profile, ownerName: name }
  };
}

export function savePersonaState(database: CompanionDatabase | null, state: PersonaState): PersonaState {
  const normalized = normalizePersonaState(state);
  const saved: PersonaState = {
    ...normalized,
    profile: { ...normalized.profile, updatedAt: new Date().toISOString() }
  };
  writeSetting(database, personaKey, saved);
  if (database && saved.profile.ownerName) {
    const owner = ownerProfile(database);
    writeSetting(database, 'owner.profile', { ...owner, name: saved.profile.ownerName });
  }
  return saved;
}

export function answerCalibration(
  database: CompanionDatabase | null,
  step: CalibrationStepId,
  answer: string,
  now: Date = new Date()
): CalibrationResult {
  const result = applyCalibrationAnswer(loadPersonaState(database), step, answer, now);
  return { ...result, state: savePersonaState(database, result.state) };
}

export function buildCompanionPrompt(
  database: CompanionDatabase | null,
  options: PersonaPromptOptions = {}
): string {
  const persona = loadPersonaState(database);
  const memory = memoryNotes(database);
  const owner = ownerProfile(database);
  const ownerDetails = ['role', 'location', 'timezone', 'work']
    .map((key) => {
      const value = owner[key];
      return typeof value === 'string' && value.trim() ? `${key}: ${value.trim()}` : '';
    })
    .filter(Boolean);
  const extra = [
    ...memory,
    ...ownerDetails
  ];
  return buildPersonaPrompt(persona, {
    ...options,
    memories: [...(options.memories ?? []), ...extra]
  });
}

export function personaSummary(database: CompanionDatabase | null): {
  state: PersonaState;
  calibrated: boolean;
  nextQuestion: string | null;
  step: CalibrationStepId | null;
} {
  const state = loadPersonaState(database);
  const step = state.calibration.completedAt ? null : nextCalibrationStep(state);
  return {
    state,
    calibrated: Boolean(state.calibration.completedAt) || step === null,
    nextQuestion: step?.question ?? null,
    step: step?.id ?? null
  };
}

export interface ProactiveQuestionOptions {
  router: ProviderRouter | null;
  model: string;
  recentConversation?: string[];
  recentQuestions?: string[];
  now?: Date;
}

export function cleanQuestion(value: string): string {
  const candidates = String(value ?? '')
    .split(/\r?\n|(?<=[!?.])\s+/)
    .map((part) => part
      .replace(/^[-*#>\d.)\s]+/, '')
      .replace(/^question:\s*/i, '')
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
  const line = (candidates.filter((part) => part.includes('?')).at(-1) ?? candidates[0] ?? '');
  const question = line.endsWith('?') || !line ? line : `${line}?`;
  return question.slice(0, 220).trim();
}

export async function generateProactiveQuestion(
  database: CompanionDatabase | null,
  options: ProactiveQuestionOptions
): Promise<{ question: string; source: 'model' | 'fallback'; reason?: string }> {
  const state = loadPersonaState(database);
  const now = options.now ?? new Date();
  const context = {
    now,
    recentConversation: options.recentConversation ?? [],
    recentQuestions: options.recentQuestions ?? []
  };
  let reason = 'provider_unavailable';
  if (options.router && options.model) {
    try {
      const response = await options.router.complete({
        model: options.model,
        messages: [
          { role: 'system', content: buildProactiveQuestionPrompt(state, context) },
          { role: 'user', content: 'Ask me one short, specific question now.' }
        ],
        maxTokens: 80,
        temperature: 0.8
      }, new AbortController().signal);
      const question = cleanQuestion(response.content);
      if (question.length >= 8 && question.endsWith('?')) return { question, source: 'model' };
      reason = `provider_response_invalid:${response.content.length}`;
    } catch (error) {
      reason = error instanceof Error ? error.message.slice(0, 160) : 'provider_request_failed';
    }
  }
  return { question: fallbackProactiveQuestion(state, context), source: 'fallback', reason };
}
