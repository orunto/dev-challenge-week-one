import { hobbies } from '@hobbymaxx/hobby-catalog';
import type { Cycle } from '@hobbymaxx/shared';
import type { Library } from './library.js';
import { points } from './library.js';
import { message, type StoredMessage } from './session.js';

export function recommendationMessages(cycle: Cycle): StoredMessage[] {
  return cycle.recommendations.map((item) => {
    const hobby = hobbies.find((entry) => entry.id === item.hobbyId);
    return {
      ...message('assistant', `${hobby?.name ?? item.hobbyId} · up to ${Math.min(hobby?.minutes ?? cycle.profile.minutesPerSession, cycle.profile.minutesPerSession)} min · ${hobby?.cost === 'free' ? 'Free' : 'Low cost'}\n\n${item.reason}\n\nTry this: ${item.firstActivity}\n\n${item.adaptation}`),
      source: 'gemma' as const,
      recommendation: { cycleId: cycle.id, hobbyId: item.hobbyId },
    };
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
