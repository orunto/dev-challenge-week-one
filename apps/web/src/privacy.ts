import { z } from 'zod';
import { hobbyIds } from '@hobbymaxx/hobby-catalog';
import {
  emptyLibrary,
  librarySchema,
  validateActivity,
  validateCycle,
} from './library.js';
import { sessionSchema, type Session } from './session.js';
import {
  acceptDataGeneration,
  flushSessionWrites,
  openDatabase,
  pauseStorageWrites,
  StorageError,
} from './storage.js';

export const backupSchema = z
  .object({
    format: z.literal('hobbymaxx'),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    session: sessionSchema.nullable(),
    library: librarySchema,
  })
  .strict();
export type Backup = z.infer<typeof backupSchema>;

export function validateBackup(value: unknown): Backup {
  const backup = backupSchema.parse(value);
  const exclusions = [
    ...(backup.session?.draft.excludedHobbyIds ?? []),
    ...(backup.session?.form.excludedHobbyIds ?? []),
    ...(backup.session?.confirmedProfile?.excludedHobbyIds ?? []),
  ];
  if (exclusions.some((id) => !hobbyIds.has(id))) {
    throw new Error('Unknown excluded hobby');
  }
  backup.library.cycles.forEach(validateCycle);
  backup.library.logs.forEach((log) => validateActivity(log, backup.library));
  return backup;
}

export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).byteLength > 5 * 1024 * 1024) {
    throw new Error('Import exceeds size limit');
  }
  return validateBackup(JSON.parse(text));
}

export async function exportBackup(): Promise<Backup> {
  await flushSessionWrites();
  const database = await openDatabase();
  try {
    const snapshot = await new Promise<{ session: unknown; library: unknown }>(
      (resolve, reject) => {
        const transaction = database.transaction(['onboarding', 'library'], 'readonly');
        const session = transaction.objectStore('onboarding').get('current');
        const library = transaction.objectStore('library').get('current');
        transaction.oncomplete = () =>
          resolve({ session: session.result, library: library.result });
        transaction.onerror = () => reject(new StorageError());
        transaction.onabort = () => reject(new StorageError());
      },
    );
    return validateBackup({
      format: 'hobbymaxx',
      version: 1,
      exportedAt: new Date().toISOString(),
      session: snapshot.session ?? null,
      library: snapshot.library ?? emptyLibrary(),
    });
  } finally {
    database.close();
  }
}

// Leave writes paused until the app has replaced its in-memory state. This prevents
// old autosaves or in-flight model operations from restoring erased/imported data.
export async function replaceLocalData(backup: Backup | null): Promise<Session | null> {
  const parsed = backup === null ? null : validateBackup(backup);
  await pauseStorageWrites();
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        ['onboarding', 'library', 'metadata'],
        'readwrite',
      );
      const sessions = transaction.objectStore('onboarding');
      const library = transaction.objectStore('library');
      const metadata = transaction.objectStore('metadata');
      const generation = metadata.get('generation');
      let nextGeneration = 0;
      generation.onsuccess = () => {
        const current = generation.result ?? 0;
        nextGeneration =
          Number.isSafeInteger(current) &&
          current >= 0 &&
          current < Number.MAX_SAFE_INTEGER
            ? current + 1
            : Date.now();
        sessions.clear();
        library.clear();
        metadata.put(nextGeneration, 'generation');
        if (parsed) {
          if (parsed.session) {
            sessions.put(parsed.session, 'current');
          }
          library.put(parsed.library, 'current');
        }
      };
      transaction.oncomplete = () => {
        acceptDataGeneration(nextGeneration);
        resolve();
      };
      transaction.onerror = () => reject(new StorageError());
      transaction.onabort = () => reject(new StorageError());
    });
    return parsed?.session ?? null;
  } finally {
    database.close();
  }
}

export async function deleteRawConversation(): Promise<Session | null> {
  await pauseStorageWrites();
  const database = await openDatabase();
  try {
    return await new Promise<Session | null>((resolve, reject) => {
      const transaction = database.transaction(['onboarding', 'metadata'], 'readwrite');
      const store = transaction.objectStore('onboarding');
      const metadata = transaction.objectStore('metadata');
      const generation = metadata.get('generation');
      const request = store.get('current');
      let next: Session | null = null;
      let nextGeneration = 0;
      request.onsuccess = () => {
        try {
          const current = generation.result ?? 0;
          nextGeneration =
            Number.isSafeInteger(current) &&
            current >= 0 &&
            current < Number.MAX_SAFE_INTEGER
              ? current + 1
              : Date.now();
          if (request.result !== undefined) {
            const currentSession = sessionSchema.parse(request.result);
            next = {
              ...currentSession,
              messages: [],
              questionAnswers: [],
              screen: currentSession.confirmedProfile ? 'confirmed' : 'welcome',
              composer: '',
              discardConversation: true,
            };
            store.put(next, 'current');
          }
          metadata.put(nextGeneration, 'generation');
        } catch {
          transaction.abort();
        }
      };
      transaction.oncomplete = () => {
        acceptDataGeneration(nextGeneration);
        resolve(next);
      };
      transaction.onerror = () => reject(new StorageError());
      transaction.onabort = () => reject(new StorageError());
    });
  } finally {
    database.close();
  }
}
