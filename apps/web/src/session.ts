import { z } from 'zod';
import {
  chatMessageSchema,
  cycleDaysSchema,
  preferenceDraftSchema,
  profileSchema,
  onboardingAnswersSchema,
} from '@hobbymaxx/shared';
import { reflectionSchema } from './reflection.js';

export const storedMessageSchema = chatMessageSchema.extend({
  id: z.string().uuid(),
  status: z.enum(['complete', 'interrupted']),
  source: z.enum(['gemma', 'utility']).optional(),
  recommendation: z.object({ cycleId: z.string().uuid(), hobbyId: z.string().min(1).max(64) }).strict().optional(),
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
    questionAnswers: onboardingAnswersSchema.optional(),
    onboardingFinished: z.boolean().optional(),
    reflection: reflectionSchema.nullable().optional(),
    refreshChoice: z.boolean().optional(),
    pendingRefresh: z.string().max(64).nullable().optional(),
    refreshPending: z.boolean().optional(),
    historyOffset: z.number().int().min(0).max(5000).optional(),
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
    questionAnswers: [],
    onboardingFinished: false,
    reflection: null,
    refreshChoice: false,
    pendingRefresh: null,
    refreshPending: false,
  };
}

export function utilityMessage(role: StoredMessage['role'], content: string): StoredMessage {
  return { ...message(role, content), source: 'utility' };
}

export function message(
  role: StoredMessage['role'],
  content: string,
  status: StoredMessage['status'] = 'complete',
): StoredMessage {
  return { id: crypto.randomUUID(), role, content, status };
}
