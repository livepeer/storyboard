/**
 * Provider call retry with exponential backoff. The runner wraps
 * each provider.call() in retry() so transient network errors and
 * 5xx responses don't kill a long task.
 */

export interface RetryOptions {
  maxAttempts: number;
  /** Base delay in ms. Doubles each attempt. */
  baseDelayMs: number;
  /** Max delay cap in ms. */
  maxDelayMs: number;
  /** Should we retry this error? */
  shouldRetry: (e: unknown, attempt: number) => boolean;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  shouldRetry: (e, _attempt) => {
    // Attempt cap is enforced by the retry() loop via maxAttempts.
    // shouldRetry only decides whether THIS error class is retryable.
    const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
    if (msg.includes("rate limit") || msg.includes("429")) return true;
    if (msg.includes("503") || msg.includes("502") || msg.includes("504")) return true;
    if (msg.includes("etimedout") || msg.includes("econnreset")) return true;
    return false;
  },
};

export async function retry<T>(fn: () => Promise<T>, opts: Partial<RetryOptions> = {}): Promise<T> {
  const o = { ...DEFAULT_RETRY, ...opts };
  let attempt = 0;
  let lastError: unknown;
  while (attempt < o.maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!o.shouldRetry(e, attempt)) throw e;
      const delay = Math.min(o.baseDelayMs * 2 ** (attempt - 1), o.maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
