import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InferenceQueue } from '../src/queue.js';

test('serializes work, bounds queue, and removes disconnected waiters', async () => {
  const queue = new InferenceQueue(1, 1000);
  const release = await queue.acquire(new AbortController().signal);
  const cancelled = new AbortController();
  const waiting = queue.acquire(cancelled.signal);
  await assert.rejects(queue.acquire(new AbortController().signal), {
    code: 'QUEUE_FULL',
  });
  cancelled.abort();
  await assert.rejects(waiting, { code: 'CANCELLED' });
  assert.deepEqual(queue.status, { active: 1, waiting: 0 });
  const next = queue.acquire(new AbortController().signal);
  release();
  const releaseNext = await next;
  release(); // A stale double release must not release somebody else's slot.
  assert.equal(queue.status.active, 1);
  releaseNext();
  assert.deepEqual(queue.status, { active: 0, waiting: 0 });
});

test('queue timeout removes waiting work without disturbing active work', async () => {
  const queue = new InferenceQueue(1, 15);
  const release = await queue.acquire(new AbortController().signal);
  await assert.rejects(queue.acquire(new AbortController().signal), {
    code: 'QUEUE_TIMEOUT',
  });
  assert.deepEqual(queue.status, { active: 1, waiting: 0 });
  release();
});
