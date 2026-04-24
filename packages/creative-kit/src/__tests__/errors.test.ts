import { describe, it, expect } from "vitest";
import { humanizeError, classifyError, isRecoverable, type AgentError } from "../agent/errors";

describe("humanizeError", () => {
  it("safety filter shows model + hint", () => {
    const err: AgentError = { kind: "safety_filter", model: "veo-i2v", prompt_snippet: "", hint: "try rephrasing" };
    expect(humanizeError(err)).toContain("veo-i2v");
    expect(humanizeError(err)).toContain("try rephrasing");
  });

  it("model unavailable lists tried models", () => {
    const err: AgentError = { kind: "model_unavailable", capability: "flux-dev", tried: ["flux-dev", "seedream"], hint: "try again" };
    expect(humanizeError(err)).toContain("flux-dev, seedream");
  });

  it("timeout shows phase + elapsed", () => {
    const err: AgentError = { kind: "timeout", phase: "inference", elapsed_ms: 45000 };
    expect(humanizeError(err)).toContain("inference");
    expect(humanizeError(err)).toContain("45s");
  });

  it("cancelled shows partial results", () => {
    const err: AgentError = { kind: "cancelled", phase: "generating", partial_results: 3 };
    expect(humanizeError(err)).toContain("3 items kept");
  });

  it("cancelled with zero partial", () => {
    const err: AgentError = { kind: "cancelled", phase: "planning", partial_results: 0 };
    expect(humanizeError(err)).not.toContain("items");
  });
});

describe("classifyError", () => {
  it("classifies safety filter", () => {
    const err = classifyError("Content blocked by safety filter");
    expect(err.kind).toBe("safety_filter");
  });

  it("classifies 503 as model unavailable", () => {
    const err = classifyError("No orchestrator available for capability 'flux-dev': 503");
    expect(err.kind).toBe("model_unavailable");
  });

  it("classifies auth errors", () => {
    const err = classifyError("HTTP 401 from signer");
    expect(err.kind).toBe("auth");
  });

  it("classifies timeout", () => {
    const err = classifyError("Request timeout after 60s");
    expect(err.kind).toBe("timeout");
  });

  it("classifies network errors", () => {
    const err = classifyError("Failed to fetch");
    expect(err.kind).toBe("network");
  });

  it("falls back to unknown", () => {
    const err = classifyError("Something completely unexpected");
    expect(err.kind).toBe("unknown");
    expect(err.message).toBe("Something completely unexpected");
  });

  it("passes context through", () => {
    const err = classifyError("blocked by policy", { model: "seedance-i2v" });
    expect(err.kind).toBe("safety_filter");
    expect((err as { model: string }).model).toBe("seedance-i2v");
  });
});

describe("isRecoverable", () => {
  it("safety filter is recoverable", () => {
    expect(isRecoverable({ kind: "safety_filter", model: "", prompt_snippet: "", hint: "" })).toBe(true);
  });

  it("auth is not recoverable", () => {
    expect(isRecoverable({ kind: "auth", message: "" })).toBe(false);
  });

  it("cancelled is not recoverable", () => {
    expect(isRecoverable({ kind: "cancelled", phase: "", partial_results: 0 })).toBe(false);
  });

  it("timeout is recoverable", () => {
    expect(isRecoverable({ kind: "timeout", phase: "", elapsed_ms: 0 })).toBe(true);
  });
});
