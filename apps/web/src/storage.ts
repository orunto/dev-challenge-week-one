import { sessionSchema, type Session } from './session.js';

const databaseName = 'hobbymaxx';
const storeName = 'onboarding';
let pending: Promise<void> = Promise.resolve();
let writeEpoch = 0;
let writesEnabled = true;
let dataGeneration: number | null = null;

export function acceptDataGeneration(value: unknown) {
  if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0)) {
    throw new StorageError();
  }
  dataGeneration = value === undefined ? 0 : Number(value);
}

export function assertDataGeneration(value: unknown) {
  const current = value === undefined ? 0 : Number(value);
  if (!Number.isSafeInteger(current) || current < 0 || (dataGeneration !== null && current !== dataGeneration)) {
    throw new StorageError();
  }
  if (dataGeneration === null) {
    dataGeneration = current;
  }
}

export async function flushSessionWrites() {
  await pending;
}

export function storageWriteToken(): number {
  if (!writesEnabled) {
    throw new StorageError();
  }
  return writeEpoch;
}

export function assertStorageWriteToken(token: number) {
  if (!writesEnabled || token !== writeEpoch) {
    throw new StorageError();
  }
}

export async function pauseStorageWrites() {
  writesEnabled = false;
  writeEpoch++;
  await pending;
}

export function resumeStorageWrites() {
  writeEpoch++;
  writesEnabled = true;
}

export class StorageError extends Error {
  constructor() {
    super('Local history could not be read or saved. Your browser may block storage or be out of space.');
  }
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new StorageError());
      return;
    }
    const request = indexedDB.open(databaseName, 3);
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new StorageError());
    }, 8000);
    const fail = () => {
      settled = true;
      clearTimeout(timer);
      reject(new StorageError());
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
      if (!request.result.objectStoreNames.contains('library')) {
        request.result.createObjectStore('library');
      }
      if (!request.result.objectStoreNames.contains('metadata')) {
        request.result.createObjectStore('metadata');
      }
    };
    request.onerror = fail;
    request.onblocked = fail;
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export async function loadSession(): Promise<Session | null> {
  await pending;
  const database = await openDatabase();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction([storeName, 'metadata'], 'readonly');
      const request = transaction.objectStore(storeName).get('current');
      const generation = transaction.objectStore('metadata').get('generation');
      transaction.oncomplete = () => {
        try {
          acceptDataGeneration(generation.result);
          resolve(request.result);
        } catch {
          reject(new StorageError());
        }
      };
      transaction.onerror = () => reject(new StorageError());
      transaction.onabort = () => reject(new StorageError());
    });
    if (value === undefined) {
      return null;
    }
    const parsed = sessionSchema.safeParse(value);
    if (!parsed.success) {
      // Preserve unreadable history; never replace it silently with an empty record.
      throw new StorageError();
    }
    return parsed.data;
  } finally {
    database.close();
  }
}

export function saveSession(session: Session): Promise<void> {
  const snapshot = sessionSchema.parse(session);
  const token = storageWriteToken();
  const write = pending.then(async () => {
    assertStorageWriteToken(token);
    const database = await openDatabase();
    try {
      assertStorageWriteToken(token);
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction([storeName, 'metadata'], 'readwrite');
        const generation = transaction.objectStore('metadata').get('generation');
        generation.onsuccess = () => {
          try {
            assertDataGeneration(generation.result);
            assertStorageWriteToken(token);
            transaction.objectStore(storeName).put(snapshot, 'current');
          } catch {
            transaction.abort();
          }
        };
        // Completion, rather than put.onsuccess, means the whole write committed.
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new StorageError());
        transaction.onabort = () => reject(new StorageError());
      });
    } finally {
      database.close();
    }
  });
  // Ordered snapshots prevent a slow old write overwriting a confirmed profile.
  pending = write.catch(() => {});
  return write;
}
