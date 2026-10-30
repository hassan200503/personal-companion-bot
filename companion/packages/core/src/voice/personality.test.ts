import { describe, expect, it } from 'vitest';
import {
  applyCalibrationAnswer,
  buildPersonaPrompt,
  buildProactiveQuestionPrompt,
  defaultPersonaState,
  describePersonality,
  fallbackProactiveQuestion,
  isPersonaCalibrated,
  mergePersonaState,
  nextCalibrationStep,
  normalizePersonaProfile,
  normalizePersonaState
} from './personality.js';

describe('normalizePersonaProfile', () => {
  it('clamps traits and trims lists', () => {
    const profile = normalizePersonaProfile({
      ownerName: '  Hassan  ',
      tone: 'direct',
      humor: 3,
      formality: -2,
      favoritePhrases: ['  make it happen  ', 'make it happen', '', 'sharp'],
      proactiveDailyCap: 99
    });
    expect(profile.ownerName).toBe('Hassan');
    expect(profile.tone).toBe('direct');
    expect(profile.humor).toBe(1);
    expect(profile.formality).toBe(0);
    expect(profile.favoritePhrases).toEqual(['make it happen', 'sharp']);
    expect(profile.proactiveDailyCap).toBe(12);
  });

  it('falls back for invalid shapes without throwing', () => {
    const profile = normalizePersonaProfile(null);
    expect(profile.companionName).toBe('Companion');
    expect(profile.tone).toBe('warm');
    expect(profile.askQuestions).toBe(true);
  });
});

describe('buildPersonaPrompt', () => {
  const state = normalizePersonaState({
    profile: {
      companionName: 'Sage',
      ownerName: 'Hassan',
      tone: 'direct',
      toneDescription: 'blunt but kind',
      favoritePhrases: ['let us ship it'],
      avoidTopics: ['his ex'],
      goals: ['finish the installer'],
      selfDescription: 'I say the thing quickly and then get on with it.'
    },
    learned: { toneNotes: ['short messages', 'no corporate filler'], vocabulary: ['ship'], topics: ['Electron'] }
  });

  it('makes the companion an independent speaker in the owner voice', () => {
    const prompt = buildPersonaPrompt(state, { modality: 'voice' });
    expect(prompt).toContain('You are Sage, Hassan\'s personal companion.');
    expect(prompt).toContain('own intelligence');
    expect(prompt).toContain('blunt but kind');
    expect(prompt).toContain('let us ship it');
    expect(prompt).toContain('his ex');
    expect(prompt).toContain('short messages');
    expect(prompt).toContain('spoken');
    expect(prompt).toContain('one to three short');
  });

  it('keeps text turns more detailed and respects askQuestions=false', () => {
    const prompt = buildPersonaPrompt(
      { ...state, profile: { ...state.profile, askQuestions: false } },
      { modality: 'text' }
    );
    expect(prompt).toContain('This turn is typed');
    expect(prompt).toContain('Do not initiate questions');
    expect(prompt).not.toContain('This turn is spoken');
  });

  it('describes the same profile deterministically', () => {
    expect(describePersonality(state.profile)).toBe(describePersonality(normalizePersonaState(state).profile));
  });
});

describe('proactive questions', () => {
  const now = new Date('2026-10-30T10:00:00');

  it('asks an open question when nothing is known', () => {
    const question = fallbackProactiveQuestion(defaultPersonaState, { now, recentQuestions: [] });
    expect(question.length).toBeGreaterThan(10);
    expect(question.endsWith('?')).toBe(true);
  });

  it('avoids repeating the last questions', () => {
    const first = fallbackProactiveQuestion(defaultPersonaState, { now, recentQuestions: [] });
    const second = fallbackProactiveQuestion(defaultPersonaState, { now, recentQuestions: [first] });
    expect(second).not.toBe(first);
  });

  it('uses a goal when one exists', () => {
    const state = mergePersonaState(defaultPersonaState, { profile: { goals: ['finish the installer'] } });
    const question = fallbackProactiveQuestion(state, { now, recentQuestions: [] });
    expect(question).toContain('finish the installer');
  });

  it('asks for exactly one speaker question in the prompt', () => {
    const prompt = buildProactiveQuestionPrompt(defaultPersonaState, { now, recentQuestions: ['What is next?'] });
    expect(prompt).toContain('Only the question');
    expect(prompt).toContain('What is next?');
    expect(prompt).toContain('one sentence, at most 20 words');
  });
});

describe('calibration', () => {
  it('walks through name, tone and boundaries', () => {
    let state = defaultPersonaState;
    expect(nextCalibrationStep(state)?.id).toBe('name');

    const nameResult = applyCalibrationAnswer(state, 'name', 'My name is Hassan.');
    state = nameResult.state;
    expect(state.profile.ownerName).toBe('Hassan');
    expect(nameResult.acknowledgment).toContain('Hassan');
    expect(nameResult.next?.id).toBe('tone');

    const toneResult = applyCalibrationAnswer(state, 'tone', 'Direct, a bit dry and quick. No fluff.');
    state = toneResult.state;
    expect(state.profile.tone).toBe('direct');
    expect(toneResult.next?.id).toBe('boundaries');

    const boundaryResult = applyCalibrationAnswer(state, 'boundaries', "Don't bring up my ex or money problems.");
    state = boundaryResult.state;
    expect(boundaryResult.next).toBeNull();
    expect(boundaryResult.step).toBe('complete');
    expect(state.profile.avoidTopics.join(' ').toLowerCase()).toContain('ex');
    expect(isPersonaCalibrated(state)).toBe(true);
    expect(nextCalibrationStep(state)).toBeNull();
  });

  it('does not restart a completed calibration', () => {
    const result = applyCalibrationAnswer(defaultPersonaState, 'name', 'Hassan');
    const again = applyCalibrationAnswer(result.state, 'name', 'Hassan');
    expect(again.state.profile.ownerName).toBe('Hassan');
  });
});
