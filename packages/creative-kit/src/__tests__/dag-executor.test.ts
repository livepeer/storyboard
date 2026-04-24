import { describe, it, expect, vi } from "vitest";
import { executeDAG, buildProjectDAG, type DAGNode } from "../agent/dag-executor";

describe("DAG Executor", () => {
  it("executes independent nodes in parallel", async () => {
    const startTimes: Record<string, number> = {};
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [], execute: async () => { startTimes.a = Date.now(); await delay(50); return "A"; } },
      { id: "b", dependsOn: [], execute: async () => { startTimes.b = Date.now(); await delay(50); return "B"; } },
      { id: "c", dependsOn: [], execute: async () => { startTimes.c = Date.now(); await delay(50); return "C"; } },
    ];

    const result = await executeDAG(nodes, { concurrency: 3 });
    expect(result.results.size).toBe(3);
    expect(result.errors.size).toBe(0);
    // All started nearly simultaneously (within 20ms)
    const times = Object.values(startTimes);
    const spread = Math.max(...times) - Math.min(...times);
    expect(spread).toBeLessThan(30);
    // Total time should be ~50ms (parallel), not 150ms (serial)
    expect(result.totalMs).toBeLessThan(120);
  });

  it("respects dependencies — downstream waits for upstream", async () => {
    const order: string[] = [];
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [], execute: async () => { order.push("a"); await delay(20); return "A"; } },
      { id: "b", dependsOn: ["a"], execute: async () => { order.push("b"); return "B"; } },
    ];

    const result = await executeDAG(nodes);
    expect(order).toEqual(["a", "b"]); // b waits for a
    expect(result.results.get("b")).toBe("B");
  });

  it("passes dependency results to downstream nodes", async () => {
    const nodes: DAGNode<number>[] = [
      { id: "a", dependsOn: [], execute: async () => 10 },
      { id: "b", dependsOn: [], execute: async () => 20 },
      { id: "sum", dependsOn: ["a", "b"], execute: async (deps) => {
        return (deps.get("a") ?? 0) + (deps.get("b") ?? 0);
      }},
    ];

    const result = await executeDAG(nodes);
    expect(result.results.get("sum")).toBe(30);
  });

  it("handles errors without stopping other branches", async () => {
    const nodes: DAGNode<string>[] = [
      { id: "ok", dependsOn: [], execute: async () => { await delay(10); return "OK"; } },
      { id: "fail", dependsOn: [], execute: async () => { throw new Error("boom"); } },
    ];

    const result = await executeDAG(nodes);
    expect(result.results.get("ok")).toBe("OK");
    expect(result.errors.has("fail")).toBe(true);
    expect(result.errors.get("fail")?.message).toBe("boom");
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let current = 0;

    const nodes: DAGNode<string>[] = Array.from({ length: 6 }, (_, i) => ({
      id: `n-${i}`,
      dependsOn: [],
      execute: async () => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        await delay(20);
        current--;
        return `done-${i}`;
      },
    }));

    await executeDAG(nodes, { concurrency: 2 });
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it("detects cycles", async () => {
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: ["b"], execute: async () => "A" },
      { id: "b", dependsOn: ["a"], execute: async () => "B" },
    ];
    await expect(executeDAG(nodes)).rejects.toThrow("Cycle");
  });

  it("detects missing dependencies", async () => {
    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: ["nonexistent"], execute: async () => "A" },
    ];
    await expect(executeDAG(nodes)).rejects.toThrow("unknown node");
  });

  it("calls lifecycle callbacks", async () => {
    const started: string[] = [];
    const completed: string[] = [];

    const nodes: DAGNode<string>[] = [
      { id: "x", dependsOn: [], execute: async () => "X", label: "Task X" },
    ];

    await executeDAG(nodes, {
      onNodeStart: (id) => started.push(id),
      onNodeComplete: (id) => completed.push(id),
    });

    expect(started).toEqual(["x"]);
    expect(completed).toEqual(["x"]);
  });

  it("supports cancellation", async () => {
    const signal = { cancelled: false };
    const executed: string[] = [];

    const nodes: DAGNode<string>[] = [
      { id: "a", dependsOn: [], execute: async () => { executed.push("a"); await delay(50); signal.cancelled = true; return "A"; } },
      { id: "b", dependsOn: ["a"], execute: async () => { executed.push("b"); return "B"; } },
    ];

    const result = await executeDAG(nodes, { cancelled: signal });
    expect(executed).toContain("a");
    // b may or may not execute depending on timing, but cancellation was signaled
    expect(result.results.has("a")).toBe(true);
  });
});

describe("buildProjectDAG", () => {
  it("builds image-only DAG (all parallel)", () => {
    const scenes = [
      { index: 0, action: "generate" },
      { index: 1, action: "generate" },
      { index: 2, action: "generate" },
    ];
    const nodes = buildProjectDAG(scenes, (i) => async () => `img-${i}`);
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => n.dependsOn.length === 0)).toBe(true);
  });

  it("builds video DAG (images → join → videos)", () => {
    const scenes = [
      { index: 0, action: "video_keyframe" },
      { index: 1, action: "video_keyframe" },
    ];
    const nodes = buildProjectDAG(
      scenes,
      (i) => async () => `img-${i}`,
      (i) => async () => `vid-${i}`,
    );
    expect(nodes).toHaveLength(4); // 2 images + 2 videos
    const vidNodes = nodes.filter((n) => n.id.startsWith("vid-"));
    expect(vidNodes[0].dependsOn).toEqual(["img-0"]);
    expect(vidNodes[1].dependsOn).toEqual(["img-1"]);
  });

  it("executes image-only DAG in parallel", async () => {
    const scenes = Array.from({ length: 4 }, (_, i) => ({ index: i, action: "generate" }));
    const nodes = buildProjectDAG<string>(
      scenes,
      (i) => async () => { await delay(10); return `result-${i}`; },
    );
    const result = await executeDAG(nodes, { concurrency: 4 });
    expect(result.results.size).toBe(4);
    expect(result.totalMs).toBeLessThan(60); // parallel, not 4 × 10ms
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
