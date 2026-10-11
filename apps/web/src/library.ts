import { z } from 'zod';
import {
  activityLogSchema,
  cycleSchema,
  recommendationsSchema,
  type ActivityLog,
  type Cycle,
  type CycleDays,
  type Profile,
} from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import {
  assertDataGeneration,
  assertStorageWriteToken,
  openDatabase,
  storageWriteToken,
  StorageError,
} from './storage.js';

export const librarySchema = z
  .object({
    version: z.literal(1),
    cycles: z.array(cycleSchema).max(200),
    currentCycleId: z.string().uuid().nullable(),
    logs: z.array(activityLogSchema).max(5000).default([]),
  })
  .strict()
  .refine((library) => {
    return (
      new Set(library.cycles.map((cycle) => cycle.id)).size === library.cycles.length &&
      new Set(library.logs.map((log) => log.id)).size === library.logs.length &&
      library.logs.every((log) =>
        library.cycles.some(
          (cycle) =>
            cycle.id === log.cycleId &&
            cycle.recommendations.some((item) => item.hobbyId === log.hobbyId),
        ),
      ) &&
      (library.currentCycleId === null ||
        library.cycles.some((cycle) => cycle.id === library.currentCycleId))
    );
  });
export type Library = z.infer<typeof librarySchema>;

export function emptyLibrary(): Library {
  return { version: 1, cycles: [], currentCycleId: null, logs: [] };
}

export function validateCycle(cycle: Cycle): Cycle {
  const parsed = cycleSchema.parse(cycle);
  if (
    parsed.profile.excludedHobbyIds?.some(
      (id) => !hobbies.some((hobby) => hobby.id === id),
    )
  ) {
    throw new Error('Unknown excluded hobby');
  }
  for (const item of parsed.recommendations) {
    const hobby = hobbies.find((entry) => entry.id === item.hobbyId);
    if (
      !hobby ||
      parsed.profile.excludedHobbyIds?.includes(item.hobbyId) ||
      (parsed.profile.budget === 'free' && hobby.cost !== 'free') ||
      (parsed.profile.environment !== 'either' &&
        hobby.environment !== 'either' &&
        hobby.environment !== parsed.profile.environment)
    ) {
      throw new Error('Invalid catalog selection');
    }
  }
  return parsed;
}

export function makeCycle(
  output: unknown,
  profile: Profile,
  days: CycleDays,
  now = new Date(),
): Cycle {
  const parsed = recommendationsSchema.parse(output);
  return validateCycle({
    id: crypto.randomUUID(),
    startedAt: now.toISOString(),
    startedOn: localDay(now),
    dueAt: new Date(now.getTime() + days * 86400000).toISOString(),
    cycleDays: days,
    profile,
    recommendations: parsed.recommendations,
  });
}

export async function loadLibrary(): Promise<Library> {
  const database = await openDatabase();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction('library', 'readonly');
      const request = transaction.objectStore('library').get('current');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(new StorageError());
      transaction.onabort = () => reject(new StorageError());
    });
    const library = value === undefined ? emptyLibrary() : librarySchema.parse(value);
    library.cycles.forEach(validateCycle);
    library.logs.forEach((log) => validateActivity(log, library));
    return library;
  } finally {
    database.close();
  }
}

export async function saveNewCycle(
  cycle: Cycle,
  expectedCurrentId?: string | null,
): Promise<Library> {
  validateCycle(cycle);
  const token = storageWriteToken();
  const database = await openDatabase();
  try {
    return await new Promise<Library>((resolve, reject) => {
      const transaction = database.transaction(['library', 'metadata'], 'readwrite');
      const store = transaction.objectStore('library');
      const generation = transaction.objectStore('metadata').get('generation');
      const request = store.get('current');
      let next: Library;
      request.onsuccess = () => {
        try {
          assertStorageWriteToken(token);
          assertDataGeneration(generation.result);
          const current =
            request.result === undefined
              ? emptyLibrary()
              : librarySchema.parse(request.result);
          if (
            expectedCurrentId !== undefined &&
            current.currentCycleId !== expectedCurrentId
          ) {
            throw new Error('The active cycle changed in another tab');
          }
          if (current.cycles.some((entry) => entry.id === cycle.id)) {
            throw new Error('Duplicate cycle');
          }
          next = librarySchema.parse({
            ...current,
            cycles: [...current.cycles, cycle],
            currentCycleId: cycle.id,
          });
          store.put(next, 'current');
        } catch {
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () => reject(new StorageError());
      transaction.onabort = () => reject(new StorageError());
    });
  } finally {
    database.close();
  }
}

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function validateActivity(log: ActivityLog, library: Library): ActivityLog {
  const parsed = activityLogSchema.parse(log);
  const cycle = library.cycles.find((item) => item.id === parsed.cycleId);
  const hobby = hobbies.find((item) => item.id === parsed.hobbyId);
  if (
    !cycle ||
    !hobby ||
    !cycle.recommendations.some((item) => item.hobbyId === hobby.id) ||
    Date.parse(parsed.recordedAt) < Date.parse(cycle.startedAt) ||
    parsed.activityId !== hobby.activityId ||
    parsed.occurredOn < (cycle.startedOn ?? cycle.startedAt.slice(0, 10)) ||
    parsed.occurredOn > (parsed.recordedOn ?? parsed.recordedAt.slice(0, 10))
  ) {
    throw new Error('Invalid activity reference or attempt date');
  }
  return parsed;
}

export function points(logs: ActivityLog[]): number {
  return (
    new Set(
      logs
        .filter((log) => log.completed)
        .map((log) => `${log.cycleId}/${log.activityId}`),
    ).size * 10
  );
}

export function isDue(cycle: Cycle, now = Date.now()): boolean {
  return now >= Date.parse(cycle.dueAt);
}

export function appendActivity(library: Library, log: ActivityLog): Library {
  validateActivity(log, library);
  if (library.logs.some((item) => item.id === log.id)) {
    return library;
  }
  return librarySchema.parse({ ...library, logs: [...library.logs, log] });
}

export async function saveActivity(log: ActivityLog): Promise<Library> {
  const token = storageWriteToken();
  const database = await openDatabase();
  try {
    return await new Promise<Library>((resolve, reject) => {
      const transaction = database.transaction(['library', 'metadata'], 'readwrite');
      const store = transaction.objectStore('library');
      const generation = transaction.objectStore('metadata').get('generation');
      const request = store.get('current');
      let next: Library;
      request.onsuccess = () => {
        try {
          assertStorageWriteToken(token);
          assertDataGeneration(generation.result);
          const current = librarySchema.parse(request.result);
          next = appendActivity(current, log);
          store.put(next, 'current');
        } catch {
          transaction.abort();
        }
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () => reject(new StorageError());
      transaction.onabort = () => reject(new StorageError());
    });
  } finally {
    database.close();
  }
}
