import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import type { InferenceClient } from '../src/ollama.js';

test('refresh keeps only an explicit favorite from the old cycle and rejects missing favorites', async (t) => {
  let ids = ['sketching', 'origami', 'singing'];
  const client: InferenceClient = {
    status: async () => ({
      installed: true,
      loaded: true,
      modelBytes: 1,
      digest: 'test',
    }),
    generate: async () => ({
      content: JSON.stringify({
        recommendations: ids.map((hobbyId) => ({
          hobbyId,
          reason: 'Fits your feedback.',
          firstActivity: 'Try for five minutes.',
          adaptation: 'Use existing supplies.',
        })),
      }),
      metrics: {
        firstTokenMs: 1,
        inferenceMs: 1,
        inputTokens: 1,
        outputTokens: 1,
        tokensPerSecond: 1,
        loadMs: 0,
      },
    }),
  };
  const app = await buildApp(readConfig({ RATE_LIMIT_MAX: '1000' }), { client });
  t.after(() => app.close());
  const payload = {
    profile: {
      interests: [],
      constraints: [],
      minutesPerSession: 5,
      budget: 'free',
      environment: 'indoor',
      socialPreference: 'solo',
    },
    previousHobbyIds: ['sketching', 'creative-writing', 'phone-photography'],
    retainedHobbyId: 'sketching',
    feedback: [{ hobbyId: 'sketching', enjoyment: 5, difficulty: 1 }],
  };
  const call = () => app.inject({ method: 'POST', url: '/api/refresh', payload });
  assert.equal((await call()).statusCode, 200);
  ids = ['origami', 'singing', 'stretching'];
  assert.equal((await call()).json().error.code, 'INVALID_MODEL_OUTPUT');
  ids = ['sketching', 'creative-writing', 'singing'];
  assert.equal((await call()).statusCode, 502);
});
