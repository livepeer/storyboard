import { describe, it, expect, vi } from "vitest";
import { createRequestQueue } from "../agent/request-queue";
import { createRequestContext } from "../agent/request-context";

describe("RequestQueue", () => {
  it("processes messages serially", async () => {
    const order: string[] = [];
    const queue = createRequestQueue(async (text) => {
      order.push(`start:${text}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end:${text}`);
    });

    // Enqueue 3 messages concurrently
    const p1 = queue.enqueue("a");
    const p2 = queue.enqueue("b");
    const p3 = queue.enqueue("c");

    await Promise.all([p1, p2, p3]);

    // Serial: a starts+ends before b starts, b before c
    expect(order).toEqual([
      "start:a", "end:a",
      "start:b", "end:b",
      "start:c", "end:c",
    ]);
  });

  it("reports pending count", async () => {
    let resolve1: () => void;
    const blocker = new Promise<void>((r) => { resolve1 = r; });

    const queue = createRequestQueue(async () => { await blocker; });

    queue.enqueue("a"); // starts immediately
    queue.enqueue("b"); // queued
    queue.enqueue("c"); // queued

    expect(queue.pending).toBe(2);
    expect(queue.isProcessing).toBe(true);

    resolve1!();
    await new Promise((r) => setTimeout(r, 50));
  });

  it("cancel clears pending and signals current", async () => {
    const processed: string[] = [];
    const queue = createRequestQueue(async (text, signal) => {
      processed.push(text);
      // Simulate work that checks cancellation
      for (let i = 0; i < 5; i++) {
        if (signal.cancelled) return;
        await new Promise((r) => setTimeout(r, 10));
      }
    });

    queue.enqueue("a"); // starts immediately
    const p2 = queue.enqueue("b").catch(() => {}); // queued — will be cancelled
    const p3 = queue.enqueue("c").catch(() => {}); // queued — will be cancelled

    // Cancel after a starts but before it finishes
    await new Promise((r) => setTimeout(r, 15));
    queue.cancel();

    await Promise.all([p2, p3]);
    await new Promise((r) => setTimeout(r, 100));

    // Only "a" was started (b and c were cancelled before starting)
    expect(processed).toEqual(["a"]);
    expect(queue.pending).toBe(0);
  });
});

describe("RequestContext", () => {
  it("creates context with unique ID", () => {
    const ctx1 = createRequestContext("hello");
    const ctx2 = createRequestContext("world");
    expect(ctx1.id).not.toBe(ctx2.id);
    expect(ctx1.userText).toBe("hello");
    expect(ctx2.userText).toBe("world");
  });

  it("cancel sets cancelled flag", () => {
    const ctx = createRequestContext("test");
    expect(ctx.cancelled).toBe(false);
    ctx.cancel();
    expect(ctx.cancelled).toBe(true);
  });

  it("records start time", () => {
    const before = Date.now();
    const ctx = createRequestContext("test");
    expect(ctx.startedAt).toBeGreaterThanOrEqual(before);
    expect(ctx.startedAt).toBeLessThanOrEqual(Date.now());
  });
});
