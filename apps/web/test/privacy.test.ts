import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { exportBackup, parseBackup, replaceLocalData } from '../src/privacy.js';
import { newSession } from '../src/session.js';
import { loadLibrary } from '../src/library.js';
import { loadSession, openDatabase, resumeStorageWrites, saveSession } from '../src/storage.js';

test('migrates version-one onboarding without erasing it and atomically imports/clears history', async (t) => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  t.after(() => { globalThis.indexedDB = original; resumeStorageWrites(); });
  const legacy = newSession();
  legacy.composer = 'Keep this unsent answer';
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('hobbymaxx', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('onboarding');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('onboarding', 'readwrite');
    transaction.objectStore('onboarding').put(legacy, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  assert.equal((await loadSession())?.composer, legacy.composer);
  const backup = await exportBackup();
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, version: 999 })));
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, library: { ...backup.library, logs: [{ points: 10000 }] } })));
  await replaceLocalData(null);
  resumeStorageWrites();
  assert.equal(await loadSession(), null);
  assert.equal((await loadLibrary()).cycles.length, 0);
  await replaceLocalData(backup);
  resumeStorageWrites();
  assert.equal((await loadSession())?.composer, legacy.composer);
});

test('a stale tab cannot autosave old content after the database generation changes', async (t) => {
  const original = globalThis.indexedDB;
  globalThis.indexedDB = new IDBFactory();
  t.after(() => { globalThis.indexedDB = original; resumeStorageWrites(); });
  await loadSession();
  const session = newSession();
  await saveSession(session);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(['onboarding', 'metadata'], 'readwrite');
    transaction.objectStore('onboarding').clear();
    transaction.objectStore('metadata').put(1, 'generation');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  await assert.rejects(saveSession({ ...session, composer: 'Stale private answer' }));
  assert.equal(await loadSession(), null);
});
