import { describe, it, expect } from "vitest";
import { createTrace, tracePhase, traceCompleted, traceError, finalizeTrace, formatTraceSummary } from "../agent/trace";

describe("PipelineTrace", () => {
  it("creates a trace with request ID", () => {
    const trace = createTrace("req_123", "make a bear");
    expect(trace.requestId).toBe("req_123");
    expect(trace.userText).toBe("make a bear");
    expect(trace.events).toHaveLength(0);
    expect(trace.active).toBe(true);
  });

  it("tracePhase starts and completes", async () => {
    const trace = createTrace("req_1", "test");
    const done = tracePhase(trace, "intent", "Classifying intent");

    expect(trace.events).toHaveLength(1);
    expect(trace.events[0].status).toBe("running");

    await new Promise((r) => setTimeout(r, 10));
    done();

    expect(trace.events[0].status).toBe("done");
    expect(trace.events[0].elapsed_ms).toBeGreaterThan(0);
  });

  it("traceCompleted records in one call", () => {
    const trace = createTrace("req_2", "test");
    traceCompleted(trace, "inference", "flux-dev: bear image", 3200, { tokens: 150 });

    expect(trace.events).toHaveLength(1);
    expect(trace.events[0].status).toBe("done");
    expect(trace.events[0].elapsed_ms).toBe(3200);
    expect(trace.events[0].meta?.tokens).toBe(150);
  });

  it("traceError marks running phase as error", () => {
    const trace = createTrace("req_3", "test");
    tracePhase(trace, "inference", "Running...");
    traceError(trace, "inference", "Safety filter blocked");

    expect(trace.events[0].status).toBe("error");
    expect(trace.events[0].detail).toBe("Safety filter blocked");
  });

  it("traceError creates new event if no running phase", () => {
    const trace = createTrace("req_4", "test");
    traceError(trace, "unknown", "Something broke");
    expect(trace.events).toHaveLength(1);
    expect(trace.events[0].status).toBe("error");
  });

  it("finalizeTrace sets active=false and totalMs", async () => {
    const trace = createTrace("req_5", "test");
    traceCompleted(trace, "step1", "done", 100);
    await new Promise((r) => setTimeout(r, 10));
    finalizeTrace(trace);

    expect(trace.active).toBe(false);
    expect(trace.totalMs).toBeGreaterThan(0);
  });

  it("formatTraceSummary produces compact string", () => {
    const trace = createTrace("req_6", "test");
    traceCompleted(trace, "intent", "new_project", 2, { tokens: 0 });
    traceCompleted(trace, "generate", "6 scenes", 15000, { tokens: 1200 });
    trace.totalMs = 15002;

    const summary = formatTraceSummary(trace);
    expect(summary).toContain("15.0s");
    expect(summary).toContain("2 steps");
    expect(summary).toContain("1,200 tokens");
  });

  it("formatTraceSummary shows errors", () => {
    const trace = createTrace("req_7", "test");
    traceCompleted(trace, "ok", "fine", 100);
    traceError(trace, "bad", "failed");
    trace.totalMs = 100;

    const summary = formatTraceSummary(trace);
    expect(summary).toContain("1 errors");
  });
});
