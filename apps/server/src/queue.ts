import { AppError } from './errors.js';

interface Waiter {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
}

// One generation at a time, across chat and structured recommendations.
export class InferenceQueue {
  private active = false;
  private waiting: Waiter[] = [];

  constructor(
    private readonly maxWaiting: number,
    private readonly timeoutMs: number,
  ) {}

  get status() {
    return { active: Number(this.active), waiting: this.waiting.length };
  }

  async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) {
      throw new AppError(499, 'CANCELLED', 'The request was cancelled.');
    }
    if (!this.active) {
      this.active = true;
      return this.releaseOnce();
    }
    if (this.waiting.length >= this.maxWaiting) {
      throw new AppError(503, 'QUEUE_FULL', 'Gemma is busy. Please try again shortly.');
    }
    return new Promise((resolve, reject) => {
      const remove = (error: Error) => {
        const index = this.waiting.indexOf(waiter);
        if (index === -1) {
          return;
        }
        this.waiting.splice(index, 1);
        waiter.cleanup();
        reject(error);
      };
      const onAbort = () =>
        remove(new AppError(499, 'CANCELLED', 'The request was cancelled.'));
      const timer = setTimeout(
        () =>
          remove(
            new AppError(
              503,
              'QUEUE_TIMEOUT',
              'The wait was too long. Please try again.',
            ),
          ),
        this.timeoutMs,
      );
      const waiter: Waiter = {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
        },
      };
      this.waiting.push(waiter);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private releaseOnce() {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const next = this.waiting.shift();
      if (next) {
        next.cleanup();
        next.resolve(this.releaseOnce());
      } else {
        this.active = false;
      }
    };
  }
}
