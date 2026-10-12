import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { localRuntimeSettings } from '../apps/server/dist/local-runtime.js';
import { startupFailure } from '../apps/server/dist/startup.js';

const root = fileURLToPath(new URL('../', import.meta.url));
let stage = 'environment';
try {
  const environmentFile = join(root, '.env');
  if (existsSync(environmentFile)) {
    process.loadEnvFile(environmentFile);
  }
  stage = 'configuration';
  const settings = localRuntimeSettings(
    root,
    process.env,
    process.argv.includes('--watch'),
  );
  if (process.platform === 'win32' && !existsSync(settings.executable)) {
    console.error(
      JSON.stringify({
        event: 'startup_failed',
        stage: 'runtime',
        code: 'LOCAL_RUNTIME_MISSING',
        message:
          'Place the portable Ollama runtime in .runtime/ollama before starting the local stack.',
      }),
    );
    process.exitCode = 1;
  } else if (!existsSync(settings.apiEntry)) {
    console.error(
      JSON.stringify({
        event: 'startup_failed',
        stage: 'application',
        code: 'API_BUILD_MISSING',
        message:
          'Build the API with bun run build:server before starting the local stack.',
      }),
    );
    process.exitCode = 1;
  } else {
    Object.assign(process.env, settings.environment);
    stage = 'application';
    await import('./container.mjs');
  }
} catch (error) {
  console.error(JSON.stringify(startupFailure(error, stage)));
  process.exitCode = 1;
}
