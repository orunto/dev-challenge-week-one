import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { evaluatedModel } from '@hobbymaxx/shared';

// Ollama stdout/stderr are deliberately not forwarded: upstream logs are not
// part of the application's audited, content-free operational logging policy.
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    child.kill('SIGTERM');
  }
  const forced = setTimeout(() => {
    for (const child of children) {
      child.kill('SIGKILL');
    }
    process.exit(code);
  }, 10000);
  forced.unref();
  process.exitCode = code;
}
function start(command, args, stdio) {
  const child = spawn(command, args, { stdio, env: process.env });
  children.add(child);
  child.once('error', () => stop(1));
  child.once('exit', () => {
    children.delete(child);
    if (!stopping) {
      stop(1);
    }
  });
  return child;
}
process.once('SIGTERM', () => stop());
process.once('SIGINT', () => stop());

async function main() {
  await mkdir(process.env.OLLAMA_MODELS ?? '/var/data/models', { recursive: true });
  start('ollama', ['serve'], 'ignore');
  start('node', ['apps/server/dist/index.js'], 'inherit');
  const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  let available = false;
  for (let i = 0; i < 60 && !stopping; i++) {
    try {
      available = (await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1000) }))
        .ok;
    } catch {
      /* Runtime startup can take a moment. */
    }
    if (available) {
      break;
    }
    await delay(1000);
  }
  if (!available || stopping) {
    throw new Error('Runtime did not start');
  }
  const model = process.env.OLLAMA_MODEL ?? evaluatedModel.tag;
  const tags = await (await fetch(`${base}/api/tags`)).json();
  if (!tags.models?.some((item) => item.name === model)) {
    console.log(JSON.stringify({ event: 'model_install_started', model }));
    const result = await fetch(`${base}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false }),
      signal: AbortSignal.timeout(1200000),
    });
    if (!result.ok || (await result.json()).error) {
      throw new Error('Model installation failed');
    }
  }
  const verifiedTags = await (await fetch(`${base}/api/tags`)).json();
  const installed = verifiedTags.models?.find((item) => item.name === model);
  if (installed?.digest !== (process.env.MODEL_DIGEST ?? evaluatedModel.digest)) {
    throw new Error('Model digest mismatch');
  }
  console.log(JSON.stringify({ event: 'model_installed', model }));
}

main().catch(() => {
  console.error(
    JSON.stringify({
      event: 'model_startup_failed',
      message: 'Check model configuration, storage, and runtime availability.',
    }),
  );
  stop(1);
});
