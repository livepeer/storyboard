/**
 * RequestContext — request-scoped state threaded through the entire
 * agent pipeline. Eliminates global mutable state (currentUserText)
 * and enables safe concurrent execution.
 *
 * Created once per user message, passed through:
 *   ChatPanel → Plugin → AgentRunner → Tool.execute()
 */

let _nextId = 0;

export interface RequestContext {
  /** Unique request ID for tracing */
  readonly id: string;
  /** Original user message (unmodified) */
  readonly userText: string;
  /** When this request started */
  readonly startedAt: number;
  /** Cancellation signal — checked between steps */
  cancelled: boolean;
  /** Cancel this request */
  cancel(): void;
}

/** Create a new request context for a user message. */
export function createRequestContext(userText: string): RequestContext {
  const id = `req_${(++_nextId).toString(36)}_${Date.now().toString(36)}`;
  const ctx: RequestContext = {
    id,
    userText,
    startedAt: Date.now(),
    cancelled: false,
    cancel() { ctx.cancelled = true; },
  };
  return ctx;
}
