import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { answerContext, answersFor, onboardingFinished, profileFromAnswers, validateAnswer } from '../src/onboarding.js';
import { message, newSession, sessionSchema } from '../src/session.js';
import { emptyLibrary, loadLibrary, makeCycle, saveOnboardingResult } from '../src/library.js';
import { loadSession, saveSession } from '../src/storage.js';

test('five answers retain every topic within the default byte budget and resume without adding a sixth', () => {
  const answers = ['日本の絵', '15 minutes', 'Free, no purchases', 'Indoors', 'Skip this question, please.'];
  answers.forEach((answer, index) => validateAnswer(answer, index, 1000));
  assert.ok(new TextEncoder().encode(JSON.stringify(answerContext(answers))).byteLength <= 1000);
  const saved = sessionSchema.parse({ ...newSession(), questionAnswers: answers });
  assert.equal(answersFor(saved).length, 5);
  assert.equal(onboardingFinished(saved), false);
  assert.throws(() => validateAnswer('Another answer', 5, 1000));
  assert.throws(() => validateAnswer('💬'.repeat(100), 0, 1000));
  assert.throws(() => sessionSchema.parse({ ...saved, questionAnswers: [...answers, 'A sixth answer'] }));
});

test('legacy progress ignores assistant/interrupted messages, while skipped fields have documented defaults', () => {
  const legacy = { ...newSession(), questionAnswers: undefined, onboardingFinished: undefined,
    messages: [message('assistant', 'A question?'), message('user', 'Drawing'), message('assistant', 'partial', 'interrupted')] };
  assert.deepEqual(answersFor(legacy), ['Drawing']);
  const draft = { interests: ['drawing'], constraints: ['Use existing supplies'], excludedHobbyIds: [], minutesPerSession: null, budget: null, environment: null, socialPreference: null };
  const profile = profileFromAnswers(draft);
  assert.equal(profile.minutesPerSession, 15);
  assert.equal(profile.budget, 'free');
  assert.equal(profile.environment, 'either');
  assert.equal(profile.socialPreference, 'either');
  assert.deepEqual(profile.constraints, draft.constraints);
  assert.equal(draft.minutesPerSession, null);
});

test('automatic onboarding commits profile and cycle together; conflicts preserve the previous snapshot', async (t) => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  t.after(() => { globalThis.indexedDB = original; });
  await loadSession();
  const before = { ...newSession(), questionAnswers: ['Drawing', '15', 'Free', 'Indoors', 'Solo'] };
  await saveSession(before);
  const profile = { interests: ['drawing'], constraints: [], minutesPerSession: 15, budget: 'free' as const, environment: 'indoor' as const, socialPreference: 'solo' as const };
  const output = { recommendations: ['sketching', 'creative-writing', 'phone-photography'].map((hobbyId) => ({ hobbyId, reason: 'Fits your answers.', firstActivity: 'Try a short activity.', adaptation: 'Use existing supplies.' })) };
  const cycle = makeCycle(output, profile, 7);
  const complete = { ...before, confirmedProfile: profile, onboardingFinished: true, screen: 'confirmed' as const };
  await assert.rejects(saveOnboardingResult(complete, cycle, crypto.randomUUID()));
  assert.equal((await loadSession())?.confirmedProfile, null);
  assert.deepEqual(await loadLibrary(), emptyLibrary());
  await saveOnboardingResult(complete, cycle, null);
  assert.equal((await loadSession())?.onboardingFinished, true);
  assert.equal((await loadLibrary()).currentCycleId, cycle.id);
  await assert.rejects(saveOnboardingResult(complete, makeCycle(output, profile, 7), cycle.id));
  assert.equal((await loadLibrary()).cycles.length, 1);
});
