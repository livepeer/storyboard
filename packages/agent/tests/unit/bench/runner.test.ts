import { describe, it, expect } from "vitest";
import { BenchRunner } from "../../../src/bench/runner.js";
import { AgentRunner } from "../../../src/agent/runner.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { WorkingMemoryStore } from "../../../src/memory/working.js";
import { SessionMemoryStore } from "../../../src/memory/session.js";
import { MockProvider } from "../../../src/providers/mock.js";

function makeAgent(responses: any[][]): AgentRunner {
  const provider = new MockProvider({ responses });
  return new AgentRunner(
    provider,
    new ToolRegistry(),
    new WorkingMemoryStore(),
    new SessionMemoryStore(),
  );
}

describe("BenchRunner", () => {
  it("runs a task and reports usage", async () => {
    const agent = makeAgent([
      [
        { kind: "text", text: "ok" },
        { kind: "usage", usage: { input: 100, output: 50 } },
        { kind: "done" },
      ],
    ]);
    const runner = new BenchRunner(agent);
    const result = await runner.runOne({
      id: "T1",
      description: "test",
      input: "hi",
      maxTokens: 500,
      category: "single-image",
    });
    expect(result.ok).toBe(true);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.totalTokens).toBe(150);
  });

  it("marks a task as failed when tokens exceed maxTokens", async () => {
    const agent = makeAgent([
      [
        { kind: "text", text: "ok" },
        { kind: "usage", usage: { input: 1000, output: 500 } },
        { kind: "done" },
      ],
    ]);
    const runner = new BenchRunner(agent);
    const result = await runner.runOne({
      id: "T2",
      description: "test",
      input: "hi",
      maxTokens: 500,
      category: "single-image",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/> max 500/);
  });

  it("runAll aggregates totals across all 6 BENCH_TASKS", async () => {
    // Each of 6 tasks gets a scripted response
    const responses: any[][] = [];
    for (let i = 0; i < 6; i++) {
      responses.push([
        { kind: "text", text: `done ${i}` },
        { kind: "usage", usage: { input: 100, output: 50 } },
        { kind: "done" },
      ]);
    }
    const agent = makeAgent(responses);
    const runner = new BenchRunner(agent);
    const report = await runner.runAll();
    expect(report.results).toHaveLength(6);
    expect(report.totals.tokens).toBe(150 * 6);
    expect(report.totals.ok + report.totals.failed).toBe(6);
  });

  it("captures toolCalls count from assistant turns", async () => {
    // MockProvider yields no tool_call_start chunks, so toolCalls stays 0
    const agent = makeAgent([
      [
        { kind: "text", text: "done" },
        { kind: "usage", usage: { input: 50, output: 20 } },
        { kind: "done" },
      ],
    ]);
    const runner = new BenchRunner(agent);
    const result = await runner.runOne({
      id: "T4",
      description: "tool count test",
      input: "test",
      maxTokens: 500,
      category: "single-image",
    });
    expect(result.toolCalls).toBe(0);
  });

  it("records durationMs as a non-negative number", async () => {
    const agent = makeAgent([
      [
        { kind: "text", text: "quick" },
        { kind: "usage", usage: { input: 10, output: 5 } },
        { kind: "done" },
      ],
    ]);
    const runner = new BenchRunner(agent);
    const result = await runner.runOne({
      id: "T5",
      description: "duration test",
      input: "test",
      maxTokens: 500,
      category: "single-image",
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("runAll produces a valid BenchReport with commit and ts fields", async () => {
    const responses: any[][] = [];
    for (let i = 0; i < 6; i++) {
      responses.push([
        { kind: "text", text: `r${i}` },
        { kind: "usage", usage: { input: 50, output: 25 } },
        { kind: "done" },
      ]);
    }
    const agent = makeAgent(responses);
    const runner = new BenchRunner(agent);
    const report = await runner.runAll();
    expect(report.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof report.commit).toBe("string");
    expect(report.commit.length).toBeGreaterThan(0);
  });
});
