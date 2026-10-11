import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OllamaClient } from '../src/ollama.js';
import { readConfig } from '../src/config.js';

const config = readConfig();
const messages = [{ role: 'user' as const, content: 'A synthetic message' }];

function streamingFetch(
  events: string,
  onRequest?: (body: Record<string, unknown>) => void,
): typeof fetch {
  return (async (url, init) => {
    if (String(url).endsWith('/api/tags')) {
      return Response.json({
        models: [{ name: config.OLLAMA_MODEL, digest: config.MODEL_DIGEST }],
      });
    }
    if (String(url).endsWith('/api/ps')) {
      return Response.json({ models: [] });
    }
    onRequest?.(JSON.parse(String(init?.body)));
    const bytes = new TextEncoder().encode(events);
    return new Response(
      new ReadableStream({
        start(controller) {
          // Split across both JSON boundaries and UTF-8 character boundaries.
          for (let i = 0; i < bytes.length; i += 3) {
            controller.enqueue(bytes.slice(i, i + 3));
          }
          controller.close();
        },
      }),
    );
  }) as typeof fetch;
}

test('parses fragmented NDJSON and UTF-8, records timing, and enforces runtime options', async () => {
  const tokens: string[] = [];
  const client = new OllamaClient(
    config,
    streamingFetch(
      [
        JSON.stringify({ message: { content: 'Try café sketching.' }, done: false }),
        JSON.stringify({
          message: { content: '' },
          done: true,
          done_reason: 'stop',
          eval_count: 10,
          eval_duration: 2e9,
          prompt_eval_count: 20,
        }),
      ].join('\n'),
      (body) => {
        assert.equal(body.stream, true);
        assert.equal(body.model, 'gemma3:1b');
        assert.equal((body.options as { num_ctx: number }).num_ctx, 4096);
      },
    ),
  );
  const result = await client.generate(
    messages,
    new AbortController().signal,
    (token) => {
      tokens.push(token);
    },
  );
  assert.equal(result.content, 'Try café sketching.');
  assert.deepEqual(tokens, ['Try café sketching.']);
  assert.equal(result.metrics.tokensPerSecond, 5);
  assert.notEqual(result.metrics.firstTokenMs, null);
});

test('rejects a truncated stream and output-limit completion instead of reporting success', async () => {
  const truncated = new OllamaClient(
    config,
    streamingFetch(JSON.stringify({ message: { content: 'partial' }, done: false })),
  );
  await assert.rejects(truncated.generate(messages, new AbortController().signal), {
    code: 'INVALID_MODEL_OUTPUT',
  });
  const limited = new OllamaClient(
    config,
    streamingFetch(
      JSON.stringify({
        message: { content: 'partial' },
        done: true,
        done_reason: 'length',
      }),
    ),
  );
  await assert.rejects(limited.generate(messages, new AbortController().signal), {
    code: 'OUTPUT_LIMIT',
  });
});

test('does not disclose upstream error text', async () => {
  const client = new OllamaClient(
    config,
    streamingFetch(JSON.stringify({ error: 'private prompt text' })),
  );
  await assert.rejects(
    client.generate(messages, new AbortController().signal),
    (error: Error) => !error.message.includes('private prompt text'),
  );
});

test('rejects changed model artifacts before sending a prompt', async () => {
  let chatCalls = 0;
  const client = new OllamaClient(config, (async (url) => {
    if (String(url).endsWith('/api/chat')) {
      chatCalls++;
    }
    return Response.json({
      models: [{ name: config.OLLAMA_MODEL, digest: 'unexpected' }],
    });
  }) as typeof fetch);

  await assert.rejects(client.generate(messages, new AbortController().signal), {
    code: 'MODEL_MISMATCH',
  });
  assert.equal(chatCalls, 0);
});

test('an already cancelled generation does not contact the runtime', async () => {
  let calls = 0;
  const client = new OllamaClient(config, (async () => {
    calls++;
    return Response.json({ models: [] });
  }) as typeof fetch);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.generate(messages, controller.signal), {
    name: 'AbortError',
  });
  assert.equal(calls, 0);
});
