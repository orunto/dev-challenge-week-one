import { z } from 'zod';
import { preferenceDraftSchema, recommendationsSchema, type ChatMessage, type PreferenceDraft, type Profile } from '@hobbymaxx/shared';

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
    QUEUE_FULL: 'Gemma is helping other people. Wait a little, then retry.',
    QUEUE_TIMEOUT: 'The queue took too long. Your work is still here; try again shortly.',
    RATE_LIMITED: 'This connection has reached its request limit. Try again later or edit your preferences yourself.',
    INFERENCE_TIMEOUT: 'Gemma took too long to reply. Retry, or continue to your preferences.',
    INVALID_MODEL_OUTPUT: 'Gemma could not finish a valid response. Retry, or enter your preferences yourself.',
    INPUT_LIMIT: 'This message is too long for the current model. Shorten it and try again.',
    CONTEXT_LIMIT: 'This conversation needs a shorter context. Continue by entering your preferences yourself.',
    INVALID_REQUEST: 'Check your message or preferences and try again.',
    MODEL_MISSING: 'Gemma is still being set up. Try again later or enter your preferences yourself.',
    MODEL_MISMATCH: 'The hosted model is not ready. Try again later or enter your preferences yourself.',
    INFERENCE_UNAVAILABLE: 'Gemma is unavailable right now. Retry, or enter your preferences yourself.',
    NETWORK_ERROR: 'We could not reach Gemma. Check your connection and retry; your work stays here.',
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
    const parsed = await response.json().catch(() => null) as { error?: { code?: string } } | null;
    throw new ApiError(parsed?.error?.code ?? 'INFERENCE_UNAVAILABLE');
  }
  return response;
}

export async function streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  onStarted: () => void,
  onToken: (content: string) => void,
): Promise<void> {
  const response = await post('/api/chat', { messages }, signal);
  if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson')) {
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
      buffered += next.done ? decoder.decode() : decoder.decode(next.value, { stream: true });
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
  const result = z.object({ profile: preferenceDraftSchema }).safeParse(await response.json());
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
  return z.object({
    modelState: z.object({ installed: z.boolean(), loaded: z.boolean() }),
    limits: z.object({ maxInputBytes: z.number().int().min(100).max(10000) }),
  }).parse(await response.json());
}

export async function requestRecommendations(profile: Profile, signal: AbortSignal) {
  const response = await post('/api/recommendations', { profile }, signal);
  const value = await response.json();
  const result = recommendationsSchema.safeParse({ recommendations: value?.recommendations });
  if (!result.success) {
    throw new ApiError('INVALID_MODEL_OUTPUT');
  }
  return result.data;
}
