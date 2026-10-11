import { z } from 'zod';

export type StartupStage = 'environment' | 'configuration' | 'application' | 'listen';

const environmentFields = new Set([
  'PORT', 'HOST', 'OLLAMA_URL', 'OLLAMA_MODEL', 'MODEL_DIGEST', 'MODEL_CONTEXT',
  'MODEL_MAX_OUTPUT', 'MODEL_THREADS', 'INFERENCE_TIMEOUT_MS', 'QUEUE_TIMEOUT_MS',
  'MAX_QUEUED_REQUESTS', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'MAX_INPUT_BYTES',
]);

const knownFailures: Record<string, string> = {
  EADDRINUSE: 'The configured port is already in use. Stop the existing server or choose another PORT.',
  EACCES: 'The process cannot bind the configured address or port. Check permissions or choose another PORT.',
  EADDRNOTAVAIL: 'HOST is not an address available on this machine. For local development, use 127.0.0.1.',
  ENOTFOUND: 'The configured HOST could not be resolved. Check HOST.',
  ERR_MODULE_NOT_FOUND: 'A required module could not be resolved. Build the workspace packages and check dependency installation against bun.lock.',
  FST_ERR_DUPLICATED_ROUTE: 'Application initialization registered a duplicate route. Check the frontend/static route configuration.',
  FST_ERR_PLUGIN_VERSION_MISMATCH: 'A Fastify plugin is incompatible with the installed Fastify version. Check dependency installation against bun.lock.',
  FST_ERR_PLUGIN_TIMEOUT: 'A Fastify plugin did not finish initialization within its timeout.',
  FST_ERR_DEC_ALREADY_PRESENT: 'A Fastify decorator was registered twice. Check plugin registration.',
  FST_ERR_CTP_ALREADY_PRESENT: 'A request content parser was registered twice. Check plugin registration.',
};

export function startupFailure(error: unknown, stage: StartupStage) {
  if (error instanceof z.ZodError && stage === 'configuration') {
    const fields = [...new Set(error.issues.map((issue) => issue.path[0]))]
      .filter((field): field is string => typeof field === 'string' && environmentFields.has(field));
    return {
      event: 'startup_failed', stage, code: 'INVALID_CONFIGURATION', fields,
      message: 'Check the listed environment fields against .env.example. Values are not logged.',
    };
  }
  const candidate = typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : undefined;
  if (typeof candidate === 'string' && Object.hasOwn(knownFailures, candidate)) {
    return { event: 'startup_failed', stage, code: candidate, message: knownFailures[candidate] };
  }
  return {
    event: 'startup_failed', stage, code: 'STARTUP_FAILURE',
    message: stage === 'environment'
      ? 'The environment file could not be loaded. Check .env access and the Node version.'
      : stage === 'configuration'
        ? 'Check environment configuration. OLLAMA_URL must be local HTTP: localhost, 127.0.0.1, or [::1].'
        : stage === 'application'
          ? 'Application initialization failed. Check dependency installation and the frontend build.'
          : 'The server could not start listening. Check HOST, PORT, and address availability.',
  };
}
