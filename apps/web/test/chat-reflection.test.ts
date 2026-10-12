import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { advanceReflection, reflectionLog, reflectionPrompt, startReflection } from '../src/reflection.js';
import { addMessages, historyMessage, recommendationMessages } from '../src/chat-hobbies.js';
import { loadLibrary, makeCycle, points, saveOnboardingResult, saveReflectionResult } from '../src/library.js';
import { newSession, sessionSchema, utilityMessage } from '../src/session.js';
import { loadSession, saveSession } from '../src/storage.js';

const profile = { interests: ['drawing'], constraints: [], minutesPerSession: 15, budget: 'free' as const, environment: 'indoor' as const, socialPreference: 'solo' as const };
const output = { recommendations: ['sketching', 'creative-writing', 'phone-photography'].map((hobbyId) => ({ hobbyId, reason: 'Fits your interests.', firstActivity: 'Try for five minutes.', adaptation: 'Use existing supplies.' })) };
const now = new Date('2026-10-12T12:00:00.000Z');

test('recommendations are linked model messages and guided ratings resume without accepting invalid scores', () => {
  const cycle = makeCycle(output, profile, 7, new Date('2026-10-11T10:00:00.000Z'));
  const recommendations = recommendationMessages(cycle);
  assert.equal(recommendations.length, 3);
  assert.equal(recommendations[0]?.recommendation?.cycleId, cycle.id);
  assert.ok(recommendations[0]?.content.includes(output.recommendations[0]!.reason));
  let draft = startReflection(cycle, 'sketching');
  draft = advanceReflection(draft, 'yes', cycle, false, now);
  draft = advanceReflection(draft, 'today', cycle, false, now);
  const saved = sessionSchema.parse({ ...newSession(), reflection: draft });
  assert.equal(saved.reflection?.step, 'enjoyment');
  assert.throws(() => advanceReflection(draft, '8', cycle, false, now));
  assert.equal(draft.enjoyment, null);
  draft = advanceReflection(draft, '4/5', cycle, false, now);
  draft = advanceReflection(draft, '2', cycle, false, now);
  draft = advanceReflection(draft, 'Would try again.', cycle, false, now);
  const log = reflectionLog(draft, now);
  assert.equal(log.enjoyment, 4);
  assert.equal(log.difficulty, 2);
  assert.equal(log.completed, true);
  assert.equal(log.reflection, 'Would try again.');
  assert.equal(log.id, draft.id);
  assert.throws(() => reflectionLog(startReflection(cycle, 'sketching'), now));
  assert.ok(reflectionPrompt(startReflection(cycle, 'sketching')).includes('Sketching'));
});

test('rating and conversation save together, retries are idempotent, and points are derived', async (t) => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  t.after(() => { globalThis.indexedDB = original; });
  await loadSession();
  const cycle = makeCycle(output, profile, 7, new Date('2026-10-11T10:00:00.000Z'));
  const complete = { ...newSession(), confirmedProfile: profile, onboardingFinished: true, screen: 'conversation' as const, messages: recommendationMessages(cycle) };
  await saveOnboardingResult(complete, cycle, null);
  let draft = startReflection(cycle, 'sketching');
  for (const value of ['yes', 'today', '5', '2']) {
    draft = advanceReflection(draft, value, cycle, false, now);
  }
  draft = advanceReflection(draft, '', cycle, true, now);
  const log = reflectionLog(draft, now);
  await saveSession({ ...complete, reflection: draft });
  const final = { ...complete, reflection: null, messages: addMessages(complete.messages, utilityMessage('assistant', 'Saved. +10 points.')) };
  const library = await saveReflectionResult(final, log);
  assert.equal(points(library.logs), 10);
  assert.equal((await loadSession())?.reflection, null);
  await saveReflectionResult(final, log);
  assert.equal((await loadLibrary()).logs.length, 1);
  assert.ok(historyMessage(await loadLibrary()).includes('Enjoyment 5/5'));
});
