import { z } from 'zod';
import {
  preferenceDraftSchema,
  recommendationsSchema,
  type ChatMessage,
  type PreferenceDraft,
  type Profile,
  type RefreshRequest,
} from '@hobbymaxx/shared';

const encoder = new TextEncoder();
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), queueMs: z.number().nonnegative() }),
  z.object({ type: z.literal('token'), content: z.string().max(8192) }),
  z.object({ type: z.literal('done'), metrics: z.unknown() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);

export class ApiError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function errorCopy(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'NETWORK_ERROR';
  const messages: Record<string, string> = {
    QUEUE_FULL: 'Gemma is busy. Try again shortly.',
    QUEUE_TIMEOUT: 'The queue timed out. Try again.',
    RATE_LIMITED: 'Request limit reached. Try again later.',
    INFERENCE_TIMEOUT: 'Gemma took too long. Try again.',
    INVALID_MODEL_OUTPUT: 'Gemma couldn’t finish this reply. Try again.',
    OUTPUT_LIMIT: 'Reply limit reached. Try a shorter message.',
    INSUFFICIENT_OPTIONS: 'Too few hobbies match. Adjust your preferences.',
    INPUT_LIMIT: 'Message too long. Shorten it and try again.',
    CONTEXT_LIMIT: 'Chat is too long. Review your preferences.',
    INVALID_REQUEST: 'Check your message or preferences and try again.',
    MODEL_MISSING: 'Gemma is still being set up. Try again shortly.',
    MODEL_MISMATCH: 'Gemma isn’t ready. Try again later.',
    INFERENCE_UNAVAILABLE: 'Gemma is unavailable. Try again shortly.',
    NETWORK_ERROR: 'Can’t reach Gemma. Check your connection and retry.',
  };
  return messages[code] ?? messages.NETWORK_ERROR!;
}

export function boundedContext(
  messages: ChatMessage[],
  maxInputBytes: number,
): { messages: ChatMessage[]; omitted: boolean } {
  const selected: ChatMessage[] = [];
  for (const item of messages.slice(-12).reverse()) {
    const candidate = [{ role: item.role, content: item.content }, ...selected];
    if (encoder.encode(JSON.stringify(candidate)).byteLength > maxInputBytes) {
      break;
    }
    selected.unshift({ role: item.role, content: item.content });
  }
  if (!selected.length || !selected.some((item) => item.role === 'user')) {
    throw new ApiError('INPUT_LIMIT');
  }
  return { messages: selected, omitted: selected.length < messages.length };
}

async function post(path: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(165000)]),
    cache: 'no-store',
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as {
      error?: { code?: string };
    } | null;
    throw new ApiError(parsed?.error?.code ?? 'INFERENCE_UNAVAILABLE');
  }
  return response;
}

export async function streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  onStarted: () => void,
  onToken: (content: string) => void,
  opening = false,
  questionIndex?: number,
): Promise<void> {
  const response = await post(
    '/api/chat',
    opening ? { messages: [], opening: true, questionIndex } : { messages, questionIndex },
    signal,
  );
  if (
    !response.body ||
    !response.headers.get('content-type')?.includes('application/x-ndjson')
  ) {
    throw new ApiError('INVALID_MODEL_OUTPUT');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let terminal = false;
  let started = false;
  let totalContent = 0;
  function consume(line: string) {
    if (!line.trim()) {
      return;
    }
    if (terminal) {
      throw new ApiError('INVALID_MODEL_OUTPUT');
    }
    let event: z.infer<typeof eventSchema>;
    try {
      event = eventSchema.parse(JSON.parse(line));
    } catch {
      throw new ApiError('INVALID_MODEL_OUTPUT');
    }
    if (event.type === 'error') {
      throw new ApiError(event.code);
    }
    if (event.type === 'started') {
      if (started) {
        throw new ApiError('INVALID_MODEL_OUTPUT');
      }
      started = true;
      onStarted();
      return;
    }
    if (!started) {
      throw new ApiError('INVALID_MODEL_OUTPUT');
    }
    if (event.type === 'token') {
      totalContent += event.content.length;
      if (totalContent > 2000) {
        throw new ApiError('INVALID_MODEL_OUTPUT');
      }
      onToken(event.content);
    } else {
      terminal = true;
    }
  }
  try {
    while (true) {
      const next = await reader.read();
      buffered += next.done
        ? decoder.decode()
        : decoder.decode(next.value, { stream: true });
      if (buffered.length > 65536) {
        throw new ApiError('INVALID_MODEL_OUTPUT');
      }
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        consume(line);
      }
      if (next.done) {
        if (buffered.trim()) {
          consume(buffered);
        }
        break;
      }
    }
    if (!terminal || totalContent === 0) {
      throw new ApiError('INVALID_MODEL_OUTPUT');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function extractPreferences(
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<PreferenceDraft> {
  const response = await post('/api/preferences', { messages }, signal);
  const result = z
    .object({ profile: preferenceDraftSchema })
    .safeParse(await response.json());
  if (!result.success) {
    throw new ApiError('INVALID_MODEL_OUTPUT');
  }
  return result.data.profile;
}

export async function serviceStatus(signal: AbortSignal) {
  const response = await fetch('/api/status', {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new ApiError('INFERENCE_UNAVAILABLE');
  }
  return z
    .object({
      modelState: z.object({ installed: z.boolean(), loaded: z.boolean() }),
      limits: z.object({ maxInputBytes: z.number().int().min(100).max(10000) }),
    })
    .parse(await response.json());
}

export async function requestRecommendations(profile: Profile, signal: AbortSignal) {
  const response = await post('/api/recommendations', { profile }, signal);
  const value = await response.json();
  const result = recommendationsSchema.safeParse({
    recommendations: value?.recommendations,
  });
  if (!result.success) {
    throw new ApiError('INVALID_MODEL_OUTPUT');
  }
  return result.data;
}

export async function requestRefresh(body: RefreshRequest, signal: AbortSignal) {
  const response = await post('/api/refresh', body, signal);
  const value = await response.json();
  const result = recommendationsSchema.safeParse({
    recommendations: value?.recommendations,
  });
  if (
    !result.success ||
    (body.retainedHobbyId &&
      !result.data.recommendations.some((item) => item.hobbyId === body.retainedHobbyId))
  ) {
    throw new ApiError('INVALID_MODEL_OUTPUT');
  }
  if (
    result.data.recommendations.some(
      (item) =>
        body.previousHobbyIds.includes(item.hobbyId) &&
        item.hobbyId !== body.retainedHobbyId,
    )
  ) {
    throw new ApiError('INVALID_MODEL_OUTPUT');
  }
  return result.data;
}
