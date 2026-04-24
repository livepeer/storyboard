/**
 * Serial request queue — processes one user message at a time.
 * Prevents concurrent state races on working memory, session context,
 * and the currentUserText global.
 *
 * Usage:
 *   const queue = createRequestQueue(processOneFn);
 *   queue.enqueue("make a cat"); // runs immediately
 *   queue.enqueue("make a dog"); // waits for cat to finish
 *   queue.cancel();              // cancels current + clears pending
 */

export interface RequestQueue {
  /** Add a message to the queue. Returns when the message is fully processed. */
  enqueue(text: string): Promise<void>;
  /** Cancel the current request and clear all pending. */
  cancel(): void;
  /** Number of pending messages (not including the active one). */
  readonly pending: number;
  /** Whether a request is currently being processed. */
  readonly isProcessing: boolean;
}

export type ProcessFn = (text: string, signal: { cancelled: boolean }) => Promise<void>;

export function createRequestQueue(processFn: ProcessFn): RequestQueue {
  const queue: Array<{ text: string; resolve: () => void; reject: (e: Error) => void }> = [];
  let running = false;
  let currentSignal: { cancelled: boolean } = { cancelled: false };

  async function drain() {
    if (running) return;
    running = true;

    while (queue.length > 0) {
      const { text, resolve, reject } = queue.shift()!;
      currentSignal = { cancelled: false };
      try {
        await processFn(text, currentSignal);
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }

    running = false;
  }

  return {
    enqueue(text: string): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        queue.push({ text, resolve, reject });
        drain();
      });
    },

    cancel() {
      currentSignal.cancelled = true;
      // Clear pending queue
      const pending = queue.splice(0);
      for (const p of pending) {
        p.reject(new Error("Cancelled"));
      }
    },

    get pending() { return queue.length; },
    get isProcessing() { return running; },
  };
}
