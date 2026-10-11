import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendActivity, emptyLibrary, isDue, makeCycle, points } from '../src/library.js';
import type { ActivityLog } from '@hobbymaxx/shared';

const profile = { interests: [], constraints: [], minutesPerSession: 5, budget: 'free' as const, environment: 'indoor' as const, socialPreference: 'solo' as const };
const output = { recommendations: ['sketching', 'creative-writing', 'phone-photography'].map((hobbyId) => ({ hobbyId, reason: 'Fits your preferences.', firstActivity: 'Try this for five minutes.', adaptation: 'Stay seated.' })) };

test('validates grounded cycles and stores exact seven/fourteen-day boundaries', () => {
  const start = new Date('2026-10-11T10:00:00.000Z');
  assert.equal(makeCycle(output, profile, 7, start).dueAt, '2026-10-18T10:00:00.000Z');
  assert.equal(makeCycle(output, profile, 14, start).dueAt, '2026-10-25T10:00:00.000Z');
  assert.throws(() => makeCycle(output, { ...profile, excludedHobbyIds: ['sketching'] }, 7));
  assert.throws(() => makeCycle({ recommendations: output.recommendations.map((item) => ({ ...item, hobbyId: 'invented' })) }, profile, 7));
});

test('completion points are derived once per activity/cycle; submission retries are idempotent', () => {
  const cycle = makeCycle(output, profile, 7, new Date('2026-10-11T10:00:00.000Z'));
  const library = { ...emptyLibrary(), cycles: [cycle], currentCycleId: cycle.id };
  const log: ActivityLog = {
    id: crypto.randomUUID(), cycleId: cycle.id, hobbyId: 'sketching', activityId: 'sketching:starter:v1',
    occurredOn: '2026-10-12', recordedAt: '2026-10-12T12:00:00.000Z', completed: true,
    enjoyment: 4, difficulty: 2, reflection: '',
  };
  const first = appendActivity(library, log);
  assert.equal(points(first.logs), 10);
  assert.equal(appendActivity(first, log).logs.length, 1);
  const repeated = appendActivity(first, { ...log, id: crypto.randomUUID() });
  assert.equal(repeated.logs.length, 2);
  assert.equal(points(repeated.logs), 10);
  assert.equal(points([{ ...log, completed: false }]), 0);
  assert.equal(isDue(cycle, Date.parse(cycle.dueAt) - 1), false);
  assert.equal(isDue(cycle, Date.parse(cycle.dueAt)), true);
  assert.throws(() => appendActivity(library, { ...log, activityId: 'invented' }));
});
