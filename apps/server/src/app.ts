import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { once } from 'node:events';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  chatRequestSchema,
  preferenceRequestSchema,
  refreshRequestSchema,
  recommendationRequestSchema,
  type ChatEvent,
} from '@hobbymaxx/shared';
import type { Config } from './config.js';
import { AppError, publicError } from './errors.js';
import { memorySnapshot } from './memory.js';
import { OllamaClient, type InferenceClient, type ModelMessage } from './ollama.js';
import {
  onboardingPrompt,
  parsePreferences,
  preferenceFormat,
  preferenceMessages,
  parseRecommendations,
  recommendationFormat,
  recommendationMessages,
  refreshProfile,
  refreshMessages,
} from './prompts.js';
import { InferenceQueue } from './queue.js';

export interface OperationalEvent {
  event: string;
  requestId?: string;
  code?: string;
  elapsedMs?: number;
}

export async function buildApp(
  config: Config,
  options: {
    client?: InferenceClient;
    log?: (event: OperationalEvent) => void;
    webRoot?: string | false;
  } = {},
) {
  // Never enable automatic request/error logging: validation errors may carry personal data.
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    requestTimeout: 20000,
    trustProxy: false,
  });
  const client = options.client ?? new OllamaClient(config);
  const queue = new InferenceQueue(config.MAX_QUEUED_REQUESTS, config.QUEUE_TIMEOUT_MS);
  const log = options.log ?? (() => {});
  const shutdown = new AbortController();
  app.addHook('preClose', async () => {
    shutdown.abort();
  });

  // Mark static routes before the rate-limit plugin's onRoute hook runs.
  // Loading fonts/scripts must not consume the model-generation allowance.
  app.addHook('onRoute', (route) => {
    if (!route.url.startsWith('/api/') && route.url !== '/ready') {
      route.config = { ...route.config, rateLimit: false };
    }
  });

  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: () =>
      new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.'),
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
    );
  });
  app.setErrorHandler((error, request, reply) => {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? error.statusCode
        : undefined;
    let safe: AppError;

    if (error instanceof z.ZodError) {
      safe = new AppError(
        400,
        'INVALID_REQUEST',
        'Please check the request format and field limits.',
      );
    } else if (statusCode === 413) {
      safe = new AppError(413, 'REQUEST_TOO_LARGE', 'The request is too large.');
    } else if (statusCode === 400) {
      safe = new AppError(400, 'INVALID_REQUEST', 'Please send valid JSON.');
    } else {
      safe = publicError(error);
    }
    log({ event: 'request_failed', requestId: request.id, code: safe.code });
    reply.code(safe.status).send({ error: { code: safe.code, message: safe.message } });
  });

  app.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));
  app.get(
    '/ready',
    { config: { rateLimit: { max: 120, timeWindow: 60000 } } },
    async (_request, reply) => {
      try {
        const state = await client.status();
        if (!state.installed) {
          return reply.code(503).send({ status: 'model_missing' });
        }
        return { status: 'ready', loaded: state.loaded };
      } catch {
        return reply.code(503).send({ status: 'inference_unavailable' });
      }
    },
  );
  app.get(
    '/api/status',
    { config: { rateLimit: { max: 120, timeWindow: 60000 } } },
    async (_request, reply) => {
      try {
        return {
          model: config.OLLAMA_MODEL,
          context: config.MODEL_CONTEXT,
          maxOutput: config.MODEL_MAX_OUTPUT,
          threads: config.MODEL_THREADS,
          limits: { maxInputBytes: config.MAX_INPUT_BYTES, maxMessages: 12 },
          modelState: await client.status(),
          queue: queue.status,
          memory: await memorySnapshot(),
        };
      } catch {
        return reply.code(503).send({
          error: { code: 'INFERENCE_UNAVAILABLE', message: 'Gemma is unavailable.' },
        });
      }
    },
  );

  function validateBudget(messages: ModelMessage[], userData: unknown) {
    if (Buffer.byteLength(JSON.stringify(userData), 'utf8') > config.MAX_INPUT_BYTES) {
      throw new AppError(
        413,
        'INPUT_LIMIT',
        'Please shorten the conversation or preference profile.',
      );
    }
    // Byte-fallback tokenizers need no more than one token per UTF-8 byte, plus
    // template tokens. Intentionally conservative until exact token counting is available.
    const upperBound = messages.reduce(
      (sum, message) => sum + Buffer.byteLength(message.content, 'utf8') + 32,
      0,
    );
    if (upperBound + config.MODEL_MAX_OUTPUT > config.MODEL_CONTEXT) {
      throw new AppError(
        413,
        'CONTEXT_LIMIT',
        'This request exceeds the configured context budget. Please shorten it.',
      );
    }
  }

  function lifecycle(request: FastifyRequest, reply: FastifyReply) {
    const disconnected = new AbortController();
    const onDisconnect = () => {
      if (!reply.raw.writableEnded) {
        disconnected.abort();
      }
    };
    reply.raw.on('close', onDisconnect);
    request.raw.on('aborted', onDisconnect);
    return {
      signal: AbortSignal.any([disconnected.signal, shutdown.signal]),
      cleanup: () => {
        reply.raw.off('close', onDisconnect);
        request.raw.off('aborted', onDisconnect);
      },
    };
  }

  async function lease(signal: AbortSignal) {
    const entered = performance.now();
    const release = await queue.acquire(signal);
    const queueMs = performance.now() - entered;
    const timeout = AbortSignal.timeout(config.INFERENCE_TIMEOUT_MS);
    return { release, queueMs, signal: AbortSignal.any([signal, timeout]), timeout };
  }

  app.post('/api/chat', async (request, reply) => {
    const body = chatRequestSchema.parse(request.body);
    const messages: ModelMessage[] = [
      { role: 'system', content: onboardingPrompt },
      ...body.messages,
    ];
    validateBudget(messages, body.messages);
    const connection = lifecycle(request, reply);
    let held: Awaited<ReturnType<typeof lease>> | undefined;
    const start = performance.now();
    const send = async (event: ChatEvent) => {
      if (reply.raw.destroyed || connection.signal.aborted) {
        throw new AppError(499, 'CANCELLED', 'The request was cancelled.');
      }
      if (!reply.raw.write(`${JSON.stringify(event)}\n`)) {
        await once(reply.raw, 'drain', { signal: held?.signal ?? connection.signal });
      }
    };
    try {
      held = await lease(connection.signal);
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no',
      });
      await send({ type: 'started', queueMs: held.queueMs });
      const result = await client.generate(messages, held.signal, (content) =>
        send({ type: 'token', content }),
      );
      await send({ type: 'done', metrics: { queueMs: held.queueMs, ...result.metrics } });
      log({
        event: 'chat_completed',
        requestId: request.id,
        elapsedMs: performance.now() - start,
      });
    } catch (error) {
      const safe = held?.timeout.aborted
        ? new AppError(504, 'INFERENCE_TIMEOUT', 'Gemma took too long. Please try again.')
        : publicError(error);
      if (!reply.raw.headersSent) {
        throw safe;
      }
      if (!reply.raw.destroyed && !connection.signal.aborted) {
        // A terminal stream error can never become a successful "done" event.
        reply.raw.write(
          `${JSON.stringify({ type: 'error', code: safe.code, message: safe.message })}\n`,
        );
      }
      log({ event: 'chat_failed', requestId: request.id, code: safe.code });
    } finally {
      held?.release();
      connection.cleanup();
      if (reply.raw.headersSent && !reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  });

  app.post('/api/preferences', async (request, reply) => {
    const body = preferenceRequestSchema.parse(request.body);
    const messages = preferenceMessages(body.messages);
    validateBudget(messages, body.messages);
    const connection = lifecycle(request, reply);
    let held: Awaited<ReturnType<typeof lease>> | undefined;
    try {
      held = await lease(connection.signal);
      const result = await client.generate(
        messages,
        held.signal,
        undefined,
        preferenceFormat,
      );
      const profile = parsePreferences(result.content);
      log({
        event: 'preferences_completed',
        requestId: request.id,
        elapsedMs: result.metrics.inferenceMs,
      });
      return { profile, metrics: { queueMs: held.queueMs, ...result.metrics } };
    } catch (error) {
      if (held?.timeout.aborted) {
        throw new AppError(
          504,
          'INFERENCE_TIMEOUT',
          'Gemma took too long. Please try again.',
        );
      }
      throw error;
    } finally {
      held?.release();
      connection.cleanup();
    }
  });

  app.post('/api/recommendations', async (request, reply) => {
    const body = recommendationRequestSchema.parse(request.body);
    const messages = recommendationMessages(body.profile);
    validateBudget(messages, body.profile);
    const connection = lifecycle(request, reply);
    let held: Awaited<ReturnType<typeof lease>> | undefined;
    try {
      held = await lease(connection.signal);
      const result = await client.generate(
        messages,
        held.signal,
        undefined,
        recommendationFormat(body.profile),
      );
      const recommendations = parseRecommendations(result.content, body.profile);
      log({
        event: 'recommendations_completed',
        requestId: request.id,
        elapsedMs: result.metrics.inferenceMs,
      });
      return {
        ...recommendations,
        metrics: { queueMs: held.queueMs, ...result.metrics },
      };
    } catch (error) {
      if (held?.timeout.aborted) {
        throw new AppError(
          504,
          'INFERENCE_TIMEOUT',
          'Gemma took too long. Please try again.',
        );
      }
      throw error;
    } finally {
      held?.release();
      connection.cleanup();
    }
  });

  app.post('/api/refresh', async (request, reply) => {
    const body = refreshRequestSchema.parse(request.body);
    const effectiveProfile = refreshProfile(body);
    const messages = refreshMessages(body, effectiveProfile);
    validateBudget(messages, body);
    const connection = lifecycle(request, reply);
    let held: Awaited<ReturnType<typeof lease>> | undefined;
    try {
      held = await lease(connection.signal);
      const result = await client.generate(
        messages,
        held.signal,
        undefined,
        recommendationFormat(effectiveProfile),
      );
      const output = parseRecommendations(result.content, effectiveProfile);
      if (
        body.retainedHobbyId &&
        !output.recommendations.some((item) => item.hobbyId === body.retainedHobbyId)
      ) {
        throw new AppError(
          502,
          'INVALID_MODEL_OUTPUT',
          'Gemma did not preserve your selected favorite. Please retry.',
        );
      }
      log({
        event: 'refresh_completed',
        requestId: request.id,
        elapsedMs: result.metrics.inferenceMs,
      });
      return { ...output, metrics: { queueMs: held.queueMs, ...result.metrics } };
    } catch (error) {
      if (held?.timeout.aborted) {
        throw new AppError(
          504,
          'INFERENCE_TIMEOUT',
          'Gemma took too long. Please try again.',
        );
      }
      throw error;
    } finally {
      held?.release();
      connection.cleanup();
    }
  });

  const webRoot =
    options.webRoot === false
      ? null
      : (options.webRoot ?? fileURLToPath(new URL('../../web/dist/', import.meta.url)));
  if (
    webRoot &&
    (await stat(webRoot)
      .then((entry) => entry.isDirectory())
      .catch(() => false))
  ) {
    await app.register(staticFiles, { root: webRoot, wildcard: false });
  }

  return app;
}
