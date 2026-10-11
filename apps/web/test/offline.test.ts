import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { serviceWorkerSource } from '../src/offline-worker.js';

test('offline worker bypasses inference, external requests, writes, and unlisted URLs', () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  runInNewContext(serviceWorkerSource(['/', '/index.html', '/assets/app.js'], 'test'), {
    self: { location: { origin: 'https://hobbymaxx.test' }, addEventListener: (type: string, handler: (event: unknown) => void) => { handlers[type] = handler; } },
    URL,
  });
  for (const [method, url] of [
    ['POST', 'https://hobbymaxx.test/api/chat'],
    ['GET', 'https://hobbymaxx.test/api/status'],
    ['GET', 'https://hobbymaxx.test/health'],
    ['GET', 'https://external.test/assets/app.js'],
    ['GET', 'https://hobbymaxx.test/private-export.json'],
  ]) {
    let intercepted = false;
    handlers.fetch!({ request: { method, url, mode: 'cors' }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, `${method} ${url}`);
  }
});
