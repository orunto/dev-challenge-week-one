import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeCycle } from '../src/library.js';

const profile = { interests: [], constraints: [], minutesPerSession: 5, budget: 'free' as const, environment: 'indoor' as const, socialPreference: 'solo' as const };
const output = { recommendations: ['sketching', 'creative-writing', 'phone-photography'].map((hobbyId) => ({ hobbyId, reason: 'Fits your preferences.', firstActivity: 'Try this for five minutes.', adaptation: 'Stay seated.' })) };

test('validates grounded cycles and stores exact seven/fourteen-day boundaries', () => {
  const start = new Date('2026-10-11T10:00:00.000Z');
  assert.equal(makeCycle(output, profile, 7, start).dueAt, '2026-10-18T10:00:00.000Z');
  assert.equal(makeCycle(output, profile, 14, start).dueAt, '2026-10-25T10:00:00.000Z');
  assert.throws(() => makeCycle(output, { ...profile, excludedHobbyIds: ['sketching'] }, 7));
  assert.throws(() => makeCycle({ recommendations: output.recommendations.map((item) => ({ ...item, hobbyId: 'invented' })) }, profile, 7));
});
