import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexedDB } from 'fake-indexeddb';
import { boundedContext, streamChat } from '../src/api.js';
import { message, newSession } from '../src/session.js';
import { loadSession, saveSession } from '../src/storage.js';

test('bounded context counts UTF-8 bytes and retains the latest answer without changing local history', () => {
  const history = [
    message('user', 'An older preference'.repeat(15)),
    message('assistant', 'What interests you?'),
    message('user', '植物と絵が好きです。'),
  ];
  const result = boundedContext(history, 200);
  assert.equal(result.omitted, true);
  assert.equal(result.messages.at(-1)?.content, history.at(-1)?.content);
  assert.ok(new TextEncoder().encode(JSON.stringify(result.messages)).byteLength <= 200);
  assert.equal(history.length, 3);
  assert.throws(() => boundedContext([message('user', '植物'.repeat(100))], 100));
});

test('stream decoder handles split UTF-8/NDJSON boundaries and rejects an unfinished reply', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const encoder = new TextEncoder();
  let completed = true;
  globalThis.fetch = (async () => {
    const text = [
      JSON.stringify({ type: 'started', queueMs: 1 }),
      JSON.stringify({ type: 'token', content: '植物' }),
      ...(completed ? [JSON.stringify({ type: 'done', metrics: {} })] : []),
    ].join('\n');
    const bytes = encoder.encode(text);
    return new Response(new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 2) {
          controller.enqueue(bytes.slice(offset, offset + 2));
        }
        controller.close();
      },
    }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  }) as typeof fetch;
  const tokens: string[] = [];
  await streamChat([{ role: 'user', content: 'Hello' }], new AbortController().signal, () => {}, (token) => { tokens.push(token); });
  assert.equal(tokens.join(''), '植物');
  completed = false;
  await assert.rejects(streamChat([{ role: 'user', content: 'Hello' }], new AbortController().signal, () => {}, () => {}), { code: 'INVALID_MODEL_OUTPUT' });
});

test('cancelling streamed inference rejects rather than producing a successful completion', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = (async (_url, options) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"type":"started","queueMs":0}\n'));
      options?.signal?.addEventListener('abort', () => controller.error(new DOMException('Cancelled', 'AbortError')), { once: true });
    },
  }), { headers: { 'Content-Type': 'application/x-ndjson' } })) as typeof fetch;
  const controller = new AbortController();
  await assert.rejects(streamChat([{ role: 'user', content: 'Hello' }], controller.signal, () => controller.abort(), () => {}), { name: 'AbortError' });
});

test('IndexedDB commits ordered snapshots, restores the confirmed profile, and discards raw conversation', async (t) => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = indexedDB;
  t.after(() => { globalThis.indexedDB = original; });
  const draft = newSession();
  draft.messages = [message('user', 'PRIVATE_RAW_FIXTURE')];
  draft.composer = 'Unsent answer';
  const confirmed = {
    ...draft,
    screen: 'confirmed' as const,
    cycleDays: 14 as const,
    discardConversation: true,
    messages: [],
    composer: '',
    confirmedProfile: {
      interests: ['drawing'], constraints: [], minutesPerSession: 10,
      budget: 'free' as const, environment: 'indoor' as const, socialPreference: 'solo' as const,
    },
  };
  await Promise.all([saveSession(draft), saveSession(confirmed)]);
  const restored = await loadSession();
  assert.equal(restored?.screen, 'confirmed');
  assert.equal(restored?.cycleDays, 14);
  assert.equal(restored?.confirmedProfile?.minutesPerSession, 10);
  assert.ok(!JSON.stringify(restored).includes('PRIVATE_RAW_FIXTURE'));
  assert.equal(restored?.composer, '');
});

test('an unsupported local record is rejected without replacing its contents', async (t) => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = indexedDB;
  t.after(() => { globalThis.indexedDB = original; });
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('hobbymaxx', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('onboarding')) {
        request.result.createObjectStore('onboarding');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  t.after(() => database.close());
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('onboarding', 'readwrite');
    transaction.objectStore('onboarding').put({ version: 999, retained: true }, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  await assert.rejects(loadSession());
  const retained = await new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction('onboarding', 'readonly');
    const request = transaction.objectStore('onboarding').get('current');
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
  });
  assert.deepEqual(retained, { version: 999, retained: true });
});
