import { z } from 'zod';
import { activityLogSchema, type ActivityLog, type Cycle } from '@hobbymaxx/shared';
import { hobbies } from '@hobbymaxx/hobby-catalog';

export const reflectionSchema = z.object({
  id: z.string().uuid(),
  cycleId: z.string().uuid(),
  hobbyId: z.string().min(1).max(64),
  step: z.enum(['completed', 'date', 'enjoyment', 'difficulty', 'note', 'save']),
  completed: z.boolean().nullable(),
  occurredOn: z.iso.date().nullable(),
  enjoyment: z.number().int().min(1).max(5).nullable(),
  difficulty: z.number().int().min(1).max(5).nullable(),
  reflection: z.string().max(500),
}).strict().refine((value) => {
  const steps = ['completed', 'date', 'enjoyment', 'difficulty', 'note', 'save'];
  const index = steps.indexOf(value.step);
  return (index < 1 || value.completed !== null) && (index < 2 || value.occurredOn !== null) &&
    (index < 3 || value.enjoyment !== null) && (index < 4 || value.difficulty !== null);
}, { message: 'Incomplete reflection progress.' });
export type Reflection = z.infer<typeof reflectionSchema>;

export function dateString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startReflection(cycle: Cycle, hobbyId: string): Reflection {
  if (!cycle.recommendations.some((item) => item.hobbyId === hobbyId)) {
    throw new Error('Unknown activity');
  }
  return { id: crypto.randomUUID(), cycleId: cycle.id, hobbyId, step: 'completed', completed: null, occurredOn: null, enjoyment: null, difficulty: null, reflection: '' };
}

export function reflectionPrompt(draft: Reflection): string {
  const name = hobbies.find((hobby) => hobby.id === draft.hobbyId)?.name ?? 'this hobby';
  const prompts = {
    completed: `Did you finish the ${name} starter, or just give it a try?`,
    date: 'When did you try it? You can type a date as YYYY-MM-DD.',
    enjoyment: 'How much did you enjoy it? 1 = not for me, 5 = loved it.',
    difficulty: 'How difficult was it? 1 = easy, 5 = very difficult.',
    note: 'Anything you’d like to remember? Add a note, or skip it.',
    save: 'Saving your attempt…',
  };
  return prompts[draft.step];
}

export function reflectionChoices(draft: Reflection): { label: string; value: string }[] {
  if (draft.step === 'completed') {
    return [{ label: 'Finished it', value: 'yes' }, { label: 'Just tried it', value: 'no' }];
  }
  if (draft.step === 'date') {
    return [{ label: 'Today', value: 'today' }, { label: 'Yesterday', value: 'yesterday' }];
  }
  if (draft.step === 'enjoyment' || draft.step === 'difficulty') {
    return [1, 2, 3, 4, 5].map((value) => ({ label: String(value), value: String(value) }));
  }
  if (draft.step === 'note') {
    return [{ label: 'Skip note', value: 'skip-note' }];
  }
  return [];
}

export function advanceReflection(draft: Reflection, reply: string, cycle: Cycle, skipNote = false, now = new Date()): Reflection {
  const value = reply.trim();
  const next = { ...draft };
  if (draft.cycleId !== cycle.id || !cycle.recommendations.some((item) => item.hobbyId === draft.hobbyId)) {
    throw new Error('This activity is no longer available.');
  }
  if (draft.step === 'completed') {
    if (/^(yes|finished it|finished|completed)$/i.test(value)) {
      next.completed = true;
    } else if (/^(no|just tried it|tried|not completed)$/i.test(value)) {
      next.completed = false;
    } else {
      throw new Error('Choose “Finished it” or “Just tried it”.');
    }
    next.step = 'date';
  } else if (draft.step === 'date') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const day = /^today$/i.test(value) ? dateString(now) : /^yesterday$/i.test(value) ? dateString(yesterday) : value;
    if (!z.iso.date().safeParse(day).success || day < (cycle.startedOn ?? cycle.startedAt.slice(0, 10)) || day > dateString(now)) {
      throw new Error('Choose a date in this cycle, not in the future.');
    }
    next.occurredOn = day;
    next.step = 'enjoyment';
  } else if (draft.step === 'enjoyment' || draft.step === 'difficulty') {
    const rating = /^([1-5])(?:\s*\/\s*5)?$/.exec(value)?.[1];
    if (!rating) {
      throw new Error('Reply with a number from 1 to 5.');
    }
    next[draft.step] = Number(rating);
    next.step = draft.step === 'enjoyment' ? 'difficulty' : 'note';
  } else if (draft.step === 'note') {
    if (!skipNote && (!value || value.length > 500)) {
      throw new Error('Keep your note to 500 characters, or skip it.');
    }
    next.reflection = skipNote ? '' : value;
    next.step = 'save';
  } else {
    throw new Error('Retry saving this attempt instead of answering again.');
  }
  return reflectionSchema.parse(next);
}

export function reflectionLog(draft: Reflection, now = new Date()): ActivityLog {
  if (draft.step !== 'save') {
    throw new Error('The reflection is incomplete.');
  }
  const hobby = hobbies.find((item) => item.id === draft.hobbyId);
  return activityLogSchema.parse({
    id: draft.id, cycleId: draft.cycleId, hobbyId: draft.hobbyId, activityId: hobby?.activityId,
    completed: draft.completed, occurredOn: draft.occurredOn, enjoyment: draft.enjoyment,
    difficulty: draft.difficulty, reflection: draft.reflection,
    recordedAt: now.toISOString(), recordedOn: dateString(now),
  });
}
