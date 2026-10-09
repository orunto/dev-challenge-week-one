import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

test('benchmark CLI exercises both endpoints and saves metrics without responses by default', async (t) => {
  const tempParent =
    process.env.HOBBYMAXX_TEST_TEMP ??
    fileURLToPath(new URL('../../../', import.meta.url));
  const directory = await mkdtemp(join(tempParent, 'hobbymaxx-benchmark-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const content = {
    recommendations: ['sketching', 'creative-writing', 'phone-photography'].map(
      (hobbyId) => ({
        hobbyId,
        reason: 'Synthetic reason',
        firstActivity: 'Synthetic activity',
        adaptation: 'Synthetic adaptation',
      }),
    ),
  };
  const app = await buildApp(readConfig({ RATE_LIMIT_MAX: '1000' }), {
    client: {
      status: async () => ({
        installed: true,
        loaded: true,
        modelBytes: 100,
        digest: 'test-only',
      }),
      generate: async (_messages, _signal, onToken, format) => {
        const text = format
          ? JSON.stringify(content)
          : 'SYNTHETIC_RESPONSE_MUST_NOT_BE_SAVED';
        await onToken?.(text);
        return {
          content: text,
          metrics: {
            firstTokenMs: 1,
            inferenceMs: 1,
            inputTokens: 1,
            outputTokens: 1,
            tokensPerSecond: 1,
            loadMs: 0,
          },
        };
      },
    },
  });
  t.after(() => app.close());
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const script = fileURLToPath(new URL('../../../scripts/benchmark.ts', import.meta.url));
  const child = spawn(
    process.execPath,
    ['--import', import.meta.resolve('tsx'), script, '--url', address],
    {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  assert.equal(code, 0, output);
  const reports = await readdir(join(directory, 'benchmark-results'));
  assert.equal(reports.length, 1);
  const text = await readFile(join(directory, 'benchmark-results', reports[0]!), 'utf8');
  const report = JSON.parse(text);
  assert.equal(report.summary.passed, 10);
  assert.equal(report.responsesIncluded, false);
  assert.ok(!text.includes('SYNTHETIC_RESPONSE_MUST_NOT_BE_SAVED'));
  assert.ok(report.results.every((item: { metrics: unknown }) => item.metrics));
});
