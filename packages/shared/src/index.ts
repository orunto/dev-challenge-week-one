import { z } from 'zod';

export const evaluatedModel = {
  tag: 'gemma3:1b',
  digest: '97558784bdc9175075a72655bf360b15da17df6b3b9e5182af9f8c0c8e58ba7c',
  quantization: 'Q4_K_M',
  ollamaVersion: '0.40.2',
} as const;

export const chatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(2000),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1).max(12),
  })
  .strict()
  .refine((value) => value.messages.at(-1)?.role === 'user', {
    message: 'The final message must be from the user.',
  });

export const profileSchema = z
  .object({
    interests: z.array(z.string().trim().min(1).max(100)).max(8),
    constraints: z.array(z.string().trim().min(1).max(160)).max(8),
    excludedHobbyIds: z.array(z.string().min(1).max(64)).max(10).optional(),
    minutesPerSession: z.number().int().min(5).max(240),
    budget: z.enum(['free', 'low', 'flexible']),
    environment: z.enum(['indoor', 'outdoor', 'either']),
    socialPreference: z.enum(['solo', 'social', 'either']),
  })
  .strict();

export const recommendationRequestSchema = z.object({ profile: profileSchema }).strict();

// Unstated facts stay null until the person explicitly chooses them in review.
export const preferenceDraftSchema = z
  .object({
    interests: z.array(z.string().trim().min(1).max(100)).max(8),
    constraints: z.array(z.string().trim().min(1).max(160)).max(8),
    excludedHobbyIds: z.array(z.string().min(1).max(64)).max(10),
    minutesPerSession: z.number().int().min(5).max(240).nullable(),
    budget: z.enum(['free', 'low', 'flexible']).nullable(),
    environment: z.enum(['indoor', 'outdoor', 'either']).nullable(),
    socialPreference: z.enum(['solo', 'social', 'either']).nullable(),
  })
  .strict();

export const preferenceRequestSchema = z
  .object({ messages: z.array(chatMessageSchema).min(1).max(12) })
  .strict()
  .refine((value) => value.messages.some((message) => message.role === 'user'), {
    message: 'At least one user message is required.',
  });

export const cycleDaysSchema = z.union([z.literal(7), z.literal(14)]);

export const recommendationSchema = z
  .object({
    hobbyId: z.string().min(1).max(64),
    reason: z.string().trim().min(1).max(500),
    firstActivity: z.string().trim().min(1).max(500),
    adaptation: z.string().trim().min(1).max(300),
  })
  .strict();

export const recommendationsSchema = z
  .object({
    recommendations: z.array(recommendationSchema).length(3),
  })
  .strict()
  .refine(
    (value) => new Set(value.recommendations.map((item) => item.hobbyId)).size === 3,
    {
      message: 'Recommendations must be distinct.',
    },
  );

export interface InferenceMetrics {
  queueMs: number;
  firstTokenMs: number | null;
  inferenceMs: number;
  inputTokens: number;
  outputTokens: number;
  tokensPerSecond: number | null;
  loadMs: number;
}

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type PreferenceDraft = z.infer<typeof preferenceDraftSchema>;
export type CycleDays = z.infer<typeof cycleDaysSchema>;
export type Recommendations = z.infer<typeof recommendationsSchema>;

export type ChatEvent =
  | { type: 'started'; queueMs: number }
  | { type: 'token'; content: string }
  | { type: 'done'; metrics: InferenceMetrics }
  | { type: 'error'; code: string; message: string };
