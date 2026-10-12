import { join } from 'node:path';
import { readConfig } from './config.js';

export function localRuntimeSettings(
  root: string,
  environment: NodeJS.ProcessEnv,
  watch = false,
  platform = process.platform,
) {
  const config = readConfig(environment);
  const runtime = join(root, '.runtime', 'ollama');
  const url = new URL(config.OLLAMA_URL);
  return {
    executable: platform === 'win32' ? join(runtime, 'ollama.exe') : 'ollama',
    apiEntry: join(root, 'apps', 'server', watch ? 'src/index.ts' : 'dist/index.js'),
    environment: {
      HOST: config.HOST,
      PORT: String(config.PORT),
      OLLAMA_URL: url.origin,
      OLLAMA_HOST: `${url.hostname}:${url.port || '80'}`,
      OLLAMA_MODELS: join(runtime, 'models'),
      OLLAMA_MODEL: config.OLLAMA_MODEL,
      MODEL_DIGEST: config.MODEL_DIGEST,
      OLLAMA_NUM_PARALLEL: '1',
      OLLAMA_MAX_LOADED_MODELS: '1',
      OLLAMA_DEBUG: 'false',
      HOBBYMAXX_PROJECT_ROOT: root,
      HOBBYMAXX_OLLAMA_EXECUTABLE:
        platform === 'win32' ? join(runtime, 'ollama.exe') : 'ollama',
      HOBBYMAXX_OLLAMA_HOME: runtime,
      HOBBYMAXX_SERVER_WATCH: watch ? 'true' : 'false',
    },
  };
}
