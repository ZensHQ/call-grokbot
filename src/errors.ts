export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class Redactor {
  private readonly secrets = new Set<string>();
  add(value: string) {
    if (value) this.secrets.add(value);
  }
  clean(value: unknown): string {
    let text = value instanceof Error ? value.message : String(value);
    for (const secret of this.secrets)
      text = text.split(secret).join('[redacted]');
    return text
      .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [redacted]')
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        '[redacted]',
      )
      .replace(
        /\b(?:grok_|crsr_|cursor_|key_)[A-Za-z0-9_-]{12,}/g,
        '[redacted]',
      );
  }
}

export function abortIfNeeded(signal?: AbortSignal) {
  signal?.throwIfAborted();
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
