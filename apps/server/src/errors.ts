export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function publicError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError(
        503,
        'INFERENCE_UNAVAILABLE',
        'Gemma is unavailable. Please try again shortly.',
      );
}
