import { describe, it, expect } from "vitest";
import { retry } from "../../src/agent/retry.js";
import { compressOldToolResults } from "../../src/agent/compress.js";
import type { Message } from "../../src/types.js";

describe("retry", () => {
  it("returns immediately on first success", async () => {
    let calls = 0;
    const result = await retry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries on 503 errors", async () => {
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("503 service unavailable");
        return "ok";
      },
      { baseDelayMs: 1, maxDelayMs: 5 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry on 4xx other than 429", async () => {
    let calls = 0;
    await expect(
      retry(async () => {
        calls++;
        throw new Error("400 bad request");
      }),
    ).rejects.toThrow("400 bad request");
    expect(calls).toBe(1);
  });

  it("gives up after maxAttempts", async () => {
    let calls = 0;
    await expect(
      retry(
        async () => {
          calls++;
          throw new Error("503");
        },
        { baseDelayMs: 1, maxDelayMs: 5 },
      ),
    ).rejects.toThrow("503");
    expect(calls).toBe(3);
  });
});

describe("compressOldToolResults", () => {
  it("keeps last 3 tool results verbatim, archives older ones", () => {
    const messages: Message[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push({
        role: "tool",
        tool_call_id: `c${i}`,
        content: "x".repeat(500),
      });
    }
    const compressed = compressOldToolResults(messages);
    expect(compressed[0].content).toContain("[archived");
    expect(compressed[1].content).toContain("[archived");
    expect(compressed[2].content).toBe("x".repeat(500));
    expect(compressed[3].content).toBe("x".repeat(500));
    expect(compressed[4].content).toBe("x".repeat(500));
  });

  it("does not archive short results even if they're old", () => {
    const messages: Message[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push({ role: "tool", tool_call_id: `c${i}`, content: "ok" });
    }
    const compressed = compressOldToolResults(messages);
    // Short results stay verbatim even if old
    expect(compressed.every((m) => m.content === "ok")).toBe(true);
  });

  it("does not touch non-tool messages", () => {
    const messages: Message[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hi back" },
    ];
    const compressed = compressOldToolResults(messages);
    expect(compressed).toEqual(messages);
  });
});
