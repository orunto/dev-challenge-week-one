import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { evaluatedModel } from '../packages/shared/dist/index.js';

// Ollama stdout/stderr are deliberately not forwarded: upstream logs are not
// part of the application's audited, content-free operational logging policy.
const children = new Set();
const shutdown = new AbortController();
let stopping = false;
function terminate(child, force = false) {
  if (!child.pid) {
    return;
  }
  if (process.platform === 'win32') {
    // Kill only the tree owned by this supervisor, including Ollama's model runner.
    const task = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    task.once('error', () => child.kill());
  } else {
    child.kill(force ? 'SIGKILL' : 'SIGTERM');
  }
}
function stop(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;
  shutdown.abort();
  for (const child of children) {
    terminate(child);
  }
  const forced = setTimeout(() => {
    for (const child of children) {
      terminate(child, true);
    }
    process.exit(code);
  }, 10000);
  forced.unref();
  process.exitCode = code;
}
function start(command, args, stdio, extraEnvironment = {}) {
  const child = spawn(command, args, {
    stdio,
    cwd: process.env.HOBBYMAXX_PROJECT_ROOT ?? process.cwd(),
    env: { ...process.env, ...extraEnvironment },
  });
  children.add(child);
  child.once('error', (error) => {
    const code = ['ENOENT', 'EACCES', 'EPERM'].includes(error.code)
      ? error.code
      : 'CHILD_START_FAILED';
    console.error(JSON.stringify({ event: 'child_start_failed', code }));
    children.delete(child);
    stop(1);
  });
  child.once('exit', (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(
        JSON.stringify({
          event: 'child_exited',
          component: args[0] === 'serve' ? 'ollama' : 'api',
          exitCode: code,
          message:
            'A managed process exited. Check startup diagnostics and whether an earlier instance is using its port.',
        }),
      );
      stop(1);
    }
  });
  return child;
}
process.once('SIGTERM', () => stop());
process.once('SIGINT', () => stop());

async function main() {
  await mkdir(process.env.OLLAMA_MODELS ?? '/var/data/models', { recursive: true });
  const home = process.env.HOBBYMAXX_OLLAMA_HOME;
  start(
    process.env.HOBBYMAXX_OLLAMA_EXECUTABLE ?? 'ollama',
    ['serve'],
    'ignore',
    home ? { HOME: home, USERPROFILE: home } : {},
  );
  const apiArguments =
    process.env.HOBBYMAXX_SERVER_WATCH === 'true'
      ? ['--watch', '--import', 'tsx', 'apps/server/src/index.ts']
      : ['apps/server/dist/index.js'];
  start(process.execPath, apiArguments, 'inherit');
  const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  let available = false;
  for (let i = 0; i < 60 && !stopping; i++) {
    try {
      available = (
        await fetch(`${base}/api/tags`, {
          signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(1000)]),
        })
      ).ok;
    } catch {
      /* Runtime startup can take a moment. */
    }
    if (available) {
      break;
    }
    await delay(1000, undefined, { signal: shutdown.signal });
  }
  if (!available || stopping) {
    throw new Error('Runtime did not start');
  }
  const model = process.env.OLLAMA_MODEL ?? evaluatedModel.tag;
  const tags = await (
    await fetch(`${base}/api/tags`, {
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(3000)]),
    })
  ).json();
  if (!tags.models?.some((item) => item.name === model)) {
    console.log(JSON.stringify({ event: 'model_install_started', model }));
    const result = await fetch(`${base}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false }),
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(1200000)]),
    });
    if (!result.ok || (await result.json()).error) {
      throw new Error('Model installation failed');
    }
  }
  const verifiedTags = await (
    await fetch(`${base}/api/tags`, {
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(3000)]),
    })
  ).json();
  const installed = verifiedTags.models?.find((item) => item.name === model);
  if (installed?.digest !== (process.env.MODEL_DIGEST ?? evaluatedModel.digest)) {
    throw new Error('Model digest mismatch');
  }
  console.log(JSON.stringify({ event: 'model_installed', model }));
}

main().catch(() => {
  if (stopping) {
    return;
  }
  console.error(
    JSON.stringify({
      event: 'model_startup_failed',
      message: 'Check model configuration, storage, and runtime availability.',
    }),
  );
  stop(1);
});
