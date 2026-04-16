import { describe, it, expect } from "vitest";
import { makeMock, textResponse, toolCallResponse } from "../helpers/mock-provider.js";

describe("MockProvider", () => {
  it("replays text response and reports usage", async () => {
    const mock = makeMock(textResponse("hello"));
    const chunks = [];
    for await (const c of mock.call({ messages: [], tools: [], tier: 1 })) {
      chunks.push(c);
    }
    const text = chunks.find((c) => c.kind === "text");
    expect(text).toEqual({ kind: "text", text: "hello" });
    const done = chunks.find((c) => c.kind === "done");
    expect(done).toEqual({ kind: "done" });
  });

  it("replays a tool call and captures the request", async () => {
    const mock = makeMock(toolCallResponse("call_1", "create_media", { prompt: "a cat" }));
    const chunks = [];
    for await (const c of mock.call({
      messages: [{ role: "user", content: "make a cat" }],
      tools: [{ name: "create_media", description: "", parameters: {} }],
      tier: 1,
    })) {
      chunks.push(c);
    }
    expect(chunks.find((c) => c.kind === "tool_call_start")).toMatchObject({
      kind: "tool_call_start",
      name: "create_media",
    });
    expect(mock.received).toHaveLength(1);
    expect(mock.received[0].messages[0].content).toBe("make a cat");
  });

  it("auto-emits done when the script forgets it", async () => {
    const mock = makeMock([{ kind: "text", text: "hi" }]);
    const chunks = [];
    for await (const c of mock.call({ messages: [], tools: [], tier: 0 })) {
      chunks.push(c);
    }
    expect(chunks[chunks.length - 1]).toEqual({ kind: "done" });
  });
});
