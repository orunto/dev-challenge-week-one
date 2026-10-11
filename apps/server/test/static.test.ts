import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import type { InferenceClient } from '../src/ollama.js';

test('serves the built app without spending inference rate limits or masking unknown API routes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'hobbymaxx-web-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>HobbyMaxx fixture</title>');
  const client: InferenceClient = {
    status: async () => ({ installed: true, loaded: true, modelBytes: 1, digest: 'test' }),
    generate: async (_messages, _signal, onToken) => {
      await onToken?.('What interests you?');
      return {
        content: 'What interests you?',
        metrics: { firstTokenMs: 1, inferenceMs: 1, inputTokens: 10, outputTokens: 5, tokensPerSecond: 5, loadMs: 0 },
      };
    },
  };
  const app = await buildApp(readConfig({ RATE_LIMIT_MAX: '1' }), { client, webRoot: root });
  t.after(() => app.close());
  const rootResponse = await app.inject('/');
  assert.equal(rootResponse.statusCode, 200);
  assert.equal(rootResponse.headers['referrer-policy'], 'no-referrer');
  assert.ok(String(rootResponse.headers['content-security-policy']).includes("worker-src 'self'"));
  assert.equal((await app.inject('/')).statusCode, 200);
  const response = await app.inject({
    method: 'POST', url: '/api/chat',
    payload: { messages: [{ role: 'user', content: 'Drawing' }] },
  });
  assert.equal(response.statusCode, 200);
  assert.equal((await app.inject('/api/unknown')).statusCode, 404);
});
