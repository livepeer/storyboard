/**
 * Structured error types for the agent pipeline.
 * Each error carries enough context for user-facing messages AND debugging.
 *
 * All layers should throw/return AgentError instead of swallowing exceptions.
 * The UI layer converts these to user-friendly messages.
 */

export type AgentError =
  | { kind: "safety_filter"; model: string; prompt_snippet: string; hint: string }
  | { kind: "model_unavailable"; capability: string; tried: string[]; hint: string }
  | { kind: "extraction_failed"; phase: string; fallback_used: boolean; detail: string }
  | { kind: "timeout"; phase: string; elapsed_ms: number }
  | { kind: "auth"; message: string }
  | { kind: "cancelled"; phase: string; partial_results: number }
  | { kind: "validation"; field: string; message: string }
  | { kind: "network"; url: string; status: number; message: string }
  | { kind: "unknown"; message: string; stack?: string };

/** Create a user-friendly message from a structured error. */
export function humanizeError(err: AgentError): string {
  switch (err.kind) {
    case "safety_filter":
      return `${err.model} blocked this content — ${err.hint}`;
    case "model_unavailable":
      return `No GPU available (tried ${err.tried.join(", ")}) — ${err.hint}`;
    case "extraction_failed":
      return `Couldn't extract ${err.phase}${err.fallback_used ? " (using fallback)" : ""}: ${err.detail}`;
    case "timeout":
      return `Timed out during ${err.phase} (${Math.round(err.elapsed_ms / 1000)}s)`;
    case "auth":
      return `Authentication failed — ${err.message}`;
    case "cancelled":
      return `Cancelled during ${err.phase}${err.partial_results > 0 ? ` (${err.partial_results} items kept)` : ""}`;
    case "validation":
      return `Invalid ${err.field}: ${err.message}`;
    case "network":
      return `Network error (${err.status}): ${err.message}`;
    case "unknown":
      return err.message;
  }
}

/** Classify a raw error string into a structured AgentError. */
export function classifyError(raw: string, context?: { model?: string; phase?: string }): AgentError {
  const lower = raw.toLowerCase();

  if (lower.includes("safety") || lower.includes("blocked") || lower.includes("policy")) {
    return {
      kind: "safety_filter",
      model: context?.model || "unknown",
      prompt_snippet: "",
      hint: "Try rephrasing with less sensitive wording",
    };
  }

  if (lower.includes("no orchestrator") || lower.includes("503") || lower.includes("no capacity") || lower.includes("no gpu")) {
    return {
      kind: "model_unavailable",
      capability: context?.model || "unknown",
      tried: context?.model ? [context.model] : [],
      hint: "Try again in a moment",
    };
  }

  if (lower.includes("401") || lower.includes("signer") || lower.includes("api key") || lower.includes("auth")) {
    return {
      kind: "auth",
      message: "Check your API key in Settings",
    };
  }

  if (lower.includes("timeout") || lower.includes("abort")) {
    return {
      kind: "timeout",
      phase: context?.phase || "inference",
      elapsed_ms: 0,
    };
  }

  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("cors")) {
    return {
      kind: "network",
      url: "",
      status: 0,
      message: "Can't reach the server — check your connection",
    };
  }

  return { kind: "unknown", message: raw };
}

/** Check if an error is recoverable (worth retrying with a different model). */
export function isRecoverable(err: AgentError): boolean {
  return err.kind === "safety_filter"
    || err.kind === "model_unavailable"
    || err.kind === "timeout"
    || err.kind === "network";
}
