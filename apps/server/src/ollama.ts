import { z } from 'zod';
import type { InferenceMetrics } from '@hobbymaxx/shared';
import type { Config } from './config.js';
import { AppError } from './errors.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface Generation {
  content: string;
  metrics: Omit<InferenceMetrics, 'queueMs'>;
}
export interface ModelStatus {
  installed: boolean;
  loaded: boolean;
  modelBytes: number | null;
  digest: string | null;
}
export interface InferenceClient {
  generate(
    messages: ModelMessage[],
    signal: AbortSignal,
    onToken?: (content: string) => void | Promise<void>,
    format?: Record<string, unknown>,
  ): Promise<Generation>;
  status(): Promise<ModelStatus>;
}

const eventSchema = z.object({
  message: z.object({ content: z.string() }).optional(),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
  error: z.string().optional(),
  load_duration: z.number().nonnegative().optional(),
  prompt_eval_count: z.number().nonnegative().optional(),
  eval_count: z.number().nonnegative().optional(),
  eval_duration: z.number().nonnegative().optional(),
});

export class OllamaClient implements InferenceClient {
  constructor(
    private readonly config: Config,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async generate(
    messages: ModelMessage[],
    signal: AbortSignal,
    onToken?: (content: string) => void | Promise<void>,
    format?: Record<string, unknown>,
  ): Promise<Generation> {
    signal.throwIfAborted();
    const state = await this.status(signal);
    signal.throwIfAborted();
    if (!state.installed) {
      throw new AppError(503, 'MODEL_MISSING', 'The configured model is not installed.');
    }
    const start = performance.now();
    const response = await this.fetcher(`${this.config.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.OLLAMA_MODEL,
        messages,
        stream: true,
        keep_alive: -1,
        ...(format ? { format } : {}),
        options: {
          num_ctx: this.config.MODEL_CONTEXT,
          num_predict: this.config.MODEL_MAX_OUTPUT,
          temperature: format ? 0.2 : 0.6,
          num_thread: this.config.MODEL_THREADS,
        },
      }),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new AppError(
        503,
        'INFERENCE_UNAVAILABLE',
        'Gemma is unavailable. Please try again shortly.',
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let content = '';
    let firstTokenMs: number | null = null;
    let final: z.infer<typeof eventSchema> | undefined;
    const processLine = async (line: string) => {
      if (!line.trim()) {
        return;
      }
      const event = eventSchema.parse(JSON.parse(line));
      if (event.error) {
        throw new AppError(
          503,
          'INFERENCE_UNAVAILABLE',
          'Gemma could not complete this request.',
        );
      }
      if (event.message?.content) {
        firstTokenMs ??= performance.now() - start;
        content += event.message.content;
        if (content.length > 32000) {
          throw new AppError(
            502,
            'INVALID_MODEL_OUTPUT',
            'Gemma returned an oversized response.',
          );
        }
        await onToken?.(event.message.content);
      }
      if (event.done) {
        final = event;
      }
    };
    try {
      while (!final) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        pending += decoder.decode(value, { stream: true });
        if (pending.length > 65536) {
          throw new AppError(
            502,
            'INVALID_MODEL_OUTPUT',
            'Gemma returned an oversized event.',
          );
        }
        let newline: number;
        while ((newline = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          await processLine(line);
          if (final) {
            break;
          }
        }
      }
      if (!final) {
        await processLine(pending + decoder.decode());
      }
      if (!final || !content.trim()) {
        throw new AppError(
          502,
          'INVALID_MODEL_OUTPUT',
          'Gemma returned an incomplete response. Please retry.',
        );
      }
      if (final.done_reason === 'length') {
        throw new AppError(
          502,
          'OUTPUT_LIMIT',
          'Gemma reached the response limit. Please retry with a shorter request.',
        );
      }
      const evalSeconds = (final.eval_duration ?? 0) / 1e9;
      return {
        content,
        metrics: {
          firstTokenMs,
          inferenceMs: performance.now() - start,
          inputTokens: final.prompt_eval_count ?? 0,
          outputTokens: final.eval_count ?? 0,
          tokensPerSecond: evalSeconds > 0 ? (final.eval_count ?? 0) / evalSeconds : null,
          loadMs: (final.load_duration ?? 0) / 1e6,
        },
      };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async status(cancellation?: AbortSignal): Promise<ModelStatus> {
    const timeout = AbortSignal.timeout(3000);
    const signal = cancellation ? AbortSignal.any([cancellation, timeout]) : timeout;
    const [tags, running] = await Promise.all([
      this.fetcher(`${this.config.OLLAMA_URL}/api/tags`, { signal }),
      this.fetcher(`${this.config.OLLAMA_URL}/api/ps`, { signal }),
    ]);
    if (!tags.ok || !running.ok) {
      throw new Error('Inference status unavailable');
    }
    const listSchema = z.object({
      models: z.array(
        z.object({
          name: z.string(),
          size: z.number().optional(),
          digest: z.string().optional(),
        }),
      ),
    });
    const installed = listSchema
      .parse(await tags.json())
      .models.find((item) => item.name === this.config.OLLAMA_MODEL);
    const loaded = listSchema
      .parse(await running.json())
      .models.find((item) => item.name === this.config.OLLAMA_MODEL);
    if (installed && installed.digest !== this.config.MODEL_DIGEST) {
      throw new AppError(
        503,
        'MODEL_MISMATCH',
        'The installed model does not match the evaluated version.',
      );
    }
    return {
      installed: Boolean(installed),
      loaded: Boolean(loaded),
      modelBytes: loaded?.size ?? null,
      digest: installed?.digest ?? null,
    };
  }
}
