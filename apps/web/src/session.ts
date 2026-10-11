import { z } from 'zod';
import {
  chatMessageSchema,
  cycleDaysSchema,
  preferenceDraftSchema,
  profileSchema,
} from '@hobbymaxx/shared';

export const storedMessageSchema = chatMessageSchema.extend({
  id: z.string().uuid(),
  status: z.enum(['complete', 'interrupted']),
});

export const reviewFormSchema = z.object({
  interests: z.string().max(808),
  constraints: z.string().max(1288),
  minutes: z.string().max(3),
  budget: z.enum(['free', 'low', 'flexible']).nullable(),
  environment: z.enum(['indoor', 'outdoor', 'either']).nullable(),
  socialPreference: z.enum(['solo', 'social', 'either']).nullable(),
  excludedHobbyIds: z.array(z.string().min(1).max(64)).max(10),
});
export type ReviewForm = z.infer<typeof reviewFormSchema>;

export const sessionSchema = z
  .object({
    version: z.literal(1),
    acceptedHostedProcessing: z.boolean(),
    screen: z.enum(['welcome', 'conversation', 'review', 'confirmed']),
    messages: z.array(storedMessageSchema).max(200),
    composer: z.string().max(500),
    draft: preferenceDraftSchema,
    form: reviewFormSchema,
    cycleDays: cycleDaysSchema,
    discardConversation: z.boolean(),
    confirmedProfile: profileSchema.nullable(),
  })
  .strict()
  .refine((value) => value.screen !== 'confirmed' || value.confirmedProfile !== null);

export type Session = z.infer<typeof sessionSchema>;
export type StoredMessage = z.infer<typeof storedMessageSchema>;

export function newSession(): Session {
  return {
    version: 1,
    acceptedHostedProcessing: false,
    screen: 'welcome',
    messages: [],
    composer: '',
    draft: {
      interests: [],
      constraints: [],
      excludedHobbyIds: [],
      minutesPerSession: null,
      budget: null,
      environment: null,
      socialPreference: null,
    },
    cycleDays: 7,
    form: {
      interests: '',
      constraints: '',
      minutes: '',
      budget: null,
      environment: null,
      socialPreference: null,
      excludedHobbyIds: [],
    },
    discardConversation: false,
    confirmedProfile: null,
  };
}

export function message(
  role: StoredMessage['role'],
  content: string,
  status: StoredMessage['status'] = 'complete',
): StoredMessage {
  return { id: crypto.randomUUID(), role, content, status };
}
