import { z } from 'zod';
import { evaluatedModel } from '@hobbymaxx/shared';

const integer = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const environmentSchema = z.object({
  PORT: integer(3000, 1, 65535),
  HOST: z.string().default('127.0.0.1'),
  OLLAMA_URL: z.url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().min(1).default(evaluatedModel.tag),
  MODEL_DIGEST: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .default(evaluatedModel.digest),
  MODEL_CONTEXT: integer(4096, 1024, 8192),
  MODEL_MAX_OUTPUT: integer(512, 64, 1024),
  MODEL_THREADS: integer(1, 1, 16),
  INFERENCE_TIMEOUT_MS: integer(120000, 100, 300000),
  QUEUE_TIMEOUT_MS: integer(30000, 10, 120000),
  MAX_QUEUED_REQUESTS: integer(3, 0, 20),
  RATE_LIMIT_MAX: integer(20, 1, 10000),
  RATE_LIMIT_WINDOW_MS: integer(3600000, 1000, 86400000),
  MAX_INPUT_BYTES: integer(1000, 100, 10000),
});

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const config = environmentSchema.parse(environment);
  const url = new URL(config.OLLAMA_URL);
  // The first release is deliberately self-hosted, not an external inference proxy.
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.protocol !== 'http:'
  ) {
    throw new Error('OLLAMA_URL must point to a local HTTP inference service.');
  }
  return config;
}

export type Config = ReturnType<typeof readConfig>;
