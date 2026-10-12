import { hobbies } from '@hobbymaxx/hobby-catalog';
import type { Cycle } from '@hobbymaxx/shared';
import type { Library } from './library.js';
import { points } from './library.js';
import { message, type StoredMessage } from './session.js';

export function recommendationMessages(cycle: Cycle, ids = cycle.recommendations.map((item) => item.hobbyId), source: 'gemma' | 'utility' = 'gemma'): StoredMessage[] {
  const selected = cycle.recommendations.filter((item) => ids.includes(item.hobbyId));
  if (!selected.length) {
    return [];
  }
  return [{
    ...message('assistant', source === 'utility' ? 'Here are the other hobbies to try.' : 'Here are your hobby recommendations.'),
    source,
    carousel: { cycleId: cycle.id, hobbyIds: selected.map((item) => item.hobbyId) },
  }];
}

export function remainingRecommendations(cycle: Cycle, library: Library): StoredMessage[] {
  const rated = new Set(library.logs.filter((log) => log.cycleId === cycle.id).map((log) => log.hobbyId));
  return recommendationMessages(cycle, cycle.recommendations.filter((item) => !rated.has(item.hobbyId)).map((item) => item.hobbyId), 'utility');
}

export function groupLegacyRecommendations(messages: StoredMessage[], library: Library): StoredMessage[] {
  if (!messages.some((item) => item.recommendation)) {
    return messages;
  }
  const grouped = new Set<string>();
  return messages.flatMap((item) => {
    if (!item.recommendation) {
      return [item];
    }
    const cycle = library.cycles.find((entry) => entry.id === item.recommendation?.cycleId);
    if (!cycle) {
      return [item];
    }
    if (grouped.has(cycle.id)) {
      return [];
    }
    grouped.add(cycle.id);
    const ids = messages.filter((entry) => entry.recommendation?.cycleId === cycle.id).map((entry) => entry.recommendation!.hobbyId);
    const carousel = recommendationMessages(cycle, ids, item.source ?? 'gemma')[0];
    return carousel ? [{ ...carousel, id: item.id }] : [item];
  });
}

export function addMessages(current: StoredMessage[], ...next: StoredMessage[]): StoredMessage[] {
  return [...current, ...next].slice(-200);
}

export function historyMessage(library: Library, offset = 0): string {
  const recent = [...library.logs].reverse().slice(offset, offset + 2).map((log) => {
    const name = hobbies.find((hobby) => hobby.id === log.hobbyId)?.name ?? log.hobbyId;
    return `${name} · ${log.occurredOn}\nEnjoyment ${log.enjoyment}/5 · difficulty ${log.difficulty}/5 · ${log.completed ? 'completed' : 'tried'}${log.reflection ? `\nNote: ${log.reflection}` : ''}`;
  });
  return `${points(library.logs)} points · ${library.logs.length} attempts${recent.length ? `\n\n${recent.join('\n\n')}` : '\nNo attempts recorded yet.'}${offset + 2 < library.logs.length ? '\n\nReply “more history” for earlier attempts.' : ''}`;
}
