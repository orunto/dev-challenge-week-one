import { sessionSchema, type Session } from './session.js';

const databaseName = 'hobbymaxx';
const storeName = 'onboarding';
let pending: Promise<void> = Promise.resolve();

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
    const request = indexedDB.open(databaseName, 2);
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
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get('current');
      transaction.oncomplete = () => resolve(request.result);
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
  const write = pending.then(async () => {
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        transaction.objectStore(storeName).put(snapshot, 'current');
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
