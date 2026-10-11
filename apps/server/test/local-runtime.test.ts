import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { localRuntimeSettings } from '../src/local-runtime.js';

test('local stack uses one endpoint and workspace model directory for both processes', () => {
  const root = join(process.cwd(), 'synthetic-project');
  const settings = localRuntimeSettings(root, { OLLAMA_URL: 'http://127.0.0.1:11435', PORT: '3001' }, false, 'win32');
  assert.equal(settings.environment.OLLAMA_HOST, '127.0.0.1:11435');
  assert.equal(settings.environment.OLLAMA_URL, 'http://127.0.0.1:11435');
  assert.equal(settings.environment.OLLAMA_MODELS, join(root, '.runtime', 'ollama', 'models'));
  assert.equal(settings.executable, join(root, '.runtime', 'ollama', 'ollama.exe'));
  assert.equal(settings.apiEntry, join(root, 'apps', 'server', 'dist/index.js'));
  assert.equal(settings.environment.PORT, '3001');
});

test('watch mode shares runtime settings and still rejects non-local inference endpoints', () => {
  const settings = localRuntimeSettings(process.cwd(), {}, true, 'win32');
  assert.equal(settings.environment.HOBBYMAXX_SERVER_WATCH, 'true');
  assert.equal(settings.environment.OLLAMA_HOST, '127.0.0.1:11434');
  assert.equal(localRuntimeSettings(process.cwd(), { OLLAMA_URL: 'http://127.0.0.1' }).environment.OLLAMA_HOST, '127.0.0.1:80');
  assert.throws(() => localRuntimeSettings(process.cwd(), { OLLAMA_URL: 'https://external.invalid' }));
});
