import { z } from 'zod';
import { cycleSchema, recommendationsSchema, type Cycle, type CycleDays, type Profile } from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';
import { openDatabase, StorageError } from './storage.js';

export const librarySchema = z.object({
  version: z.literal(1),
  cycles: z.array(cycleSchema).max(200),
  currentCycleId: z.string().uuid().nullable(),
}).strict().refine((library) => {
  return new Set(library.cycles.map((cycle) => cycle.id)).size === library.cycles.length &&
    (library.currentCycleId === null || library.cycles.some((cycle) => cycle.id === library.currentCycleId));
});
export type Library = z.infer<typeof librarySchema>;

export function emptyLibrary(): Library {
  return { version: 1, cycles: [], currentCycleId: null };
}

export function validateCycle(cycle: Cycle): Cycle {
  const parsed = cycleSchema.parse(cycle);
  for (const item of parsed.recommendations) {
    const hobby = hobbies.find((entry) => entry.id === item.hobbyId);
    if (!hobby || parsed.profile.excludedHobbyIds?.includes(item.hobbyId) ||
      (parsed.profile.budget === 'free' && hobby.cost !== 'free') ||
      (parsed.profile.environment !== 'either' && hobby.environment !== 'either' && hobby.environment !== parsed.profile.environment)) {
      throw new Error('Invalid catalog selection');
    }
  }
  return parsed;
}

export function makeCycle(output: unknown, profile: Profile, days: CycleDays, now = new Date()): Cycle {
  const parsed = recommendationsSchema.parse(output);
  return validateCycle({
    id: crypto.randomUUID(),
    startedAt: now.toISOString(),
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
    return library;
  } finally {
    database.close();
  }
}

export async function saveNewCycle(cycle: Cycle): Promise<Library> {
  validateCycle(cycle);
  const database = await openDatabase();
  try {
    return await new Promise<Library>((resolve, reject) => {
      const transaction = database.transaction('library', 'readwrite');
      const store = transaction.objectStore('library');
      const request = store.get('current');
      let next: Library;
      request.onsuccess = () => {
        try {
          const current = request.result === undefined ? emptyLibrary() : librarySchema.parse(request.result);
          if (current.cycles.some((entry) => entry.id === cycle.id)) {
            throw new Error('Duplicate cycle');
          }
          next = librarySchema.parse({ ...current, cycles: [...current.cycles, cycle], currentCycleId: cycle.id });
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
