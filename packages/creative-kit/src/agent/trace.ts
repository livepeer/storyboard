/**
 * Pipeline Trace — structured event log for agent execution.
 *
 * Records every phase of request processing with timing.
 * Rendered by PipelineTrace component for user visibility.
 *
 * Inspired by Claude Code's tool-use display.
 */

export interface TraceEvent {
  /** Phase name */
  phase: string;
  /** What happened */
  detail: string;
  /** Duration in ms (set when phase completes) */
  elapsed_ms?: number;
  /** Status */
  status: "running" | "done" | "error" | "skipped";
  /** Timestamp */
  timestamp: number;
  /** Optional metadata */
  meta?: Record<string, unknown>;
}

export interface PipelineTrace {
  /** Unique request ID */
  requestId: string;
  /** Original user message */
  userText: string;
  /** All trace events */
  events: TraceEvent[];
  /** Total elapsed time */
  totalMs: number;
  /** Whether the trace is still running */
  active: boolean;
}

/** Create a new trace for a request. */
export function createTrace(requestId: string, userText: string): PipelineTrace {
  return {
    requestId,
    userText,
    events: [],
    totalMs: 0,
    active: true,
  };
}

/** Start a trace phase. Returns a function to complete it. */
export function tracePhase(trace: PipelineTrace, phase: string, detail: string): () => void {
  const event: TraceEvent = {
    phase,
    detail,
    status: "running",
    timestamp: Date.now(),
  };
  trace.events.push(event);

  return () => {
    event.elapsed_ms = Date.now() - event.timestamp;
    event.status = "done";
  };
}

/** Record a completed phase in one call. */
export function traceCompleted(trace: PipelineTrace, phase: string, detail: string, elapsed_ms: number, meta?: Record<string, unknown>): void {
  trace.events.push({
    phase,
    detail,
    elapsed_ms,
    status: "done",
    timestamp: Date.now(),
    meta,
  });
}

/** Record an error in a phase. */
export function traceError(trace: PipelineTrace, phase: string, detail: string): void {
  // Find running event for this phase and mark as error
  const running = trace.events.find((e) => e.phase === phase && e.status === "running");
  if (running) {
    running.status = "error";
    running.detail = detail;
    running.elapsed_ms = Date.now() - running.timestamp;
  } else {
    trace.events.push({
      phase,
      detail,
      status: "error",
      timestamp: Date.now(),
    });
  }
}

/** Finalize the trace. */
export function finalizeTrace(trace: PipelineTrace): void {
  trace.active = false;
  const first = trace.events[0];
  if (first) {
    trace.totalMs = Date.now() - first.timestamp;
  }
}

/** Format trace as a compact summary string. */
export function formatTraceSummary(trace: PipelineTrace): string {
  const done = trace.events.filter((e) => e.status === "done");
  const errors = trace.events.filter((e) => e.status === "error");
  const totalSec = (trace.totalMs / 1000).toFixed(1);
  const parts = [`${totalSec}s`];
  if (done.length > 0) parts.push(`${done.length} steps`);
  if (errors.length > 0) parts.push(`${errors.length} errors`);
  // Sum tokens from metadata
  const tokens = trace.events.reduce((sum, e) => sum + ((e.meta?.tokens as number) || 0), 0);
  if (tokens > 0) parts.push(`${tokens.toLocaleString()} tokens`);
  return parts.join(" · ");
}
