import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp, type OperationalEvent } from '../src/app.js';
import { readConfig } from '../src/config.js';
import type { InferenceClient, ModelMessage } from '../src/ollama.js';

const draft = {
  interests: ['drawing'],
  constraints: [],
  excludedHobbyIds: [],
  minutesPerSession: null,
  budget: null,
  environment: null,
  socialPreference: null,
};
const metrics = {
  firstTokenMs: null,
  inferenceMs: 1,
  inputTokens: 20,
  outputTokens: 20,
  tokensPerSecond: null,
  loadMs: 0,
};

test('preference extraction preserves unknowns and ignores assistant-supplied facts', async (t) => {
  const received: ModelMessage[][] = [];
  const client: InferenceClient = {
    status: async () => ({
      installed: true,
      loaded: true,
      modelBytes: 1,
      digest: 'test',
    }),
    generate: async (messages, _signal, _onToken, format) => {
      received.push(messages);
      assert.ok(format);
      return { content: JSON.stringify(draft), metrics };
    },
  };
  const app = await buildApp(readConfig({}), { client });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: '/api/preferences',
    payload: {
      messages: [
        { role: 'user', content: 'I like drawing.' },
        { role: 'assistant', content: 'ASSISTANT_ONLY_BUDGET_FACT' },
      ],
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.json().profile, draft);
  assert.ok(!JSON.stringify(received).includes('ASSISTANT_ONLY_BUDGET_FACT'));
});

test('invalid extraction and private upstream errors do not expose conversation content', async (t) => {
  const secret = 'PRIVATE_CONVERSATION_FIXTURE';
  const logs: OperationalEvent[] = [];
  let output = JSON.stringify({ ...draft, excludedHobbyIds: ['invented'] });
  let fail = false;
  const client: InferenceClient = {
    status: async () => ({
      installed: true,
      loaded: true,
      modelBytes: 1,
      digest: 'test',
    }),
    generate: async () => {
      if (fail) {
        throw new Error(secret);
      }
      return { content: output, metrics };
    },
  };
  const app = await buildApp(readConfig({}), {
    client,
    log: (event) => logs.push(event),
  });
  t.after(() => app.close());
  const call = () =>
    app.inject({
      method: 'POST',
      url: '/api/preferences',
      payload: { messages: [{ role: 'user', content: secret }] },
    });
  assert.equal((await call()).json().error.code, 'INVALID_MODEL_OUTPUT');
  output = JSON.stringify({ ...draft, minutesPerSession: 0 });
  assert.equal((await call()).statusCode, 502);
  fail = true;
  const response = await call();
  assert.equal(response.statusCode, 503);
  assert.ok(!response.body.includes(secret));
  assert.ok(!JSON.stringify(logs).includes(secret));
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/preferences',
    payload: { messages: [{ role: 'system', content: secret }] },
  });
  assert.equal(invalid.statusCode, 400);
});
