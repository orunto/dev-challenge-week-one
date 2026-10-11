import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  recommendationsSchema,
  type ChatEvent,
  type InferenceMetrics,
} from '../packages/shared/dist/index.js';
import { benchmarkCases } from './benchmark-cases.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:3000' },
    concurrency: { type: 'string', default: '1' },
    repeats: { type: 'string', default: '1' },
    'save-responses': { type: 'boolean', default: false },
    cases: { type: 'string' },
  },
});
const base = new URL(values.url!);
const concurrency = Number(values.concurrency);
const repeats = Number(values.repeats);
const selectedIds = values.cases?.split(',');
const selectedCases = selectedIds
  ? benchmarkCases.filter((item) => selectedIds.includes(item.id))
  : benchmarkCases;
if (selectedIds?.some((id) => !benchmarkCases.some((item) => item.id === id))) {
  throw new Error('Unknown benchmark case ID.');
}
if (![concurrency, repeats].every((n) => Number.isInteger(n) && n >= 1 && n <= 10)) {
  throw new Error('Concurrency and repeats must be integers between 1 and 10.');
}
if (
  base.protocol !== 'https:' &&
  !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))
) {
  throw new Error('Use HTTPS for a deployed benchmark, or HTTP for localhost.');
}

async function request(path: string, payload?: unknown) {
  return fetch(new URL(path, base), {
    method: payload ? 'POST' : 'GET',
    headers: payload ? { 'Content-Type': 'application/json' } : {},
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(180000),
  });
}

interface Result {
  caseId: string;
  kind: 'chat' | 'recommendations';
  repeat: number;
  ok: boolean;
  httpStatus?: number;
  elapsedMs: number;
  networkFirstTokenMs?: number | null;
  metrics?: InferenceMetrics;
  errorCode?: string;
  response?: unknown;
  review: string;
}

async function run(
  item: (typeof benchmarkCases)[number],
  kind: Result['kind'],
  repeat: number,
): Promise<Result> {
  const started = performance.now();
  const result: Result = {
    caseId: item.id,
    kind,
    repeat,
    ok: false,
    elapsedMs: 0,
    review: item.review,
  };
  try {
    const response = await request(
      `/api/${kind}`,
      kind === 'chat'
        ? { messages: [{ role: 'user', content: item.message }] }
        : { profile: item.profile },
    );
    result.httpStatus = response.status;
    if (!response.ok) {
      const error = (await response.json()) as { error?: { code?: string } };
      result.errorCode = error.error?.code ?? 'HTTP_ERROR';
    } else if (kind === 'recommendations') {
      const data = (await response.json()) as {
        recommendations: unknown;
        metrics: InferenceMetrics;
      };
      const validated = recommendationsSchema.parse({
        recommendations: data.recommendations,
      });
      result.metrics = data.metrics;
      result.ok = true;
      if (values['save-responses']) {
        result.response = validated;
      }
    } else {
      if (!response.body) {
        throw new Error('Missing stream');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let text = '';
      let completed = false;
      result.networkFirstTokenMs = null;
      const processLine = (line: string) => {
        if (!line.trim()) {
          return;
        }
        const event = JSON.parse(line) as ChatEvent;
        if (event.type === 'token') {
          result.networkFirstTokenMs ??= performance.now() - started;
          text += event.content;
        } else if (event.type === 'done') {
          completed = true;
          result.metrics = event.metrics;
        } else if (event.type === 'error') {
          result.errorCode = event.code;
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          pending += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = pending.indexOf('\n')) !== -1) {
            processLine(pending.slice(0, newline));
            pending = pending.slice(newline + 1);
          }
        }
        processLine(pending + decoder.decode());
      } finally {
        reader.releaseLock();
      }
      result.ok = completed && !result.errorCode && Boolean(text.trim());
      if (!result.ok) {
        result.errorCode ??= 'INCOMPLETE_STREAM';
      }
      if (values['save-responses']) {
        result.response = text;
      }
    }
  } catch {
    result.errorCode = 'BENCHMARK_REQUEST_FAILED';
  }
  result.elapsedMs = performance.now() - started;
  console.log(
    `${result.ok ? 'PASS' : 'FAIL'} ${kind} ${item.id}: ${Math.round(result.elapsedMs)}ms${result.errorCode ? ` (${result.errorCode})` : ''}`,
  );
  return result;
}

async function main() {
  const beforeResponse = await request('/api/status');
  if (!beforeResponse.ok) {
    throw new Error(
      'Gemma is not reachable. Start Ollama and install the configured model.',
    );
  }
  const before = (await beforeResponse.json()) as {
    modelState?: { installed?: boolean };
  };
  if (!before.modelState?.installed) {
    throw new Error('The configured model is not installed.');
  }
  const jobs = Array.from({ length: repeats }, (_, i) =>
    selectedCases.flatMap((item) =>
      (['chat', 'recommendations'] as const).map((kind) => ({
        item,
        kind,
        repeat: i + 1,
      })),
    ),
  ).flat();
  let next = 0;
  const results: Result[] = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++]!;
        results.push(await run(job.item, job.kind, job.repeat));
      }
    }),
  );
  const afterResponse = await request('/api/status');
  const after = afterResponse.ok ? await afterResponse.json() : null;
  const successful = results
    .filter((r) => r.ok)
    .map((r) => r.elapsedMs)
    .sort((a, b) => a - b);
  const percentile = (p: number) =>
    successful.length ? successful[Math.ceil(successful.length * p) - 1] : null;
  const report = {
    createdAt: new Date().toISOString(),
    origin: base.origin,
    concurrency,
    repeats,
    syntheticFixturesOnly: true,
    responsesIncluded: values['save-responses'],
    note: 'PASS means transport/schema success, not human recommendation-quality approval. Container peak is lifetime peak; repeat on a fresh service for clean comparisons.',
    before,
    after,
    summary: {
      requests: results.length,
      passed: successful.length,
      failed: results.length - successful.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
    },
    results,
  };
  await mkdir('benchmark-results', { recursive: true });
  const path = `benchmark-results/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(`Report: ${path}`);
  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
