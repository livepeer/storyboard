import { describe, it, expectTypeOf } from "vitest";
import type { LLMProvider, LLMChunk, LLMRequest } from "../../src/providers/types.js";

describe("LLMProvider interface", () => {
  it("LLMChunk discriminated union covers all expected variants", () => {
    const text: LLMChunk = { kind: "text", text: "hi" };
    const start: LLMChunk = { kind: "tool_call_start", id: "c1", name: "foo" };
    const args: LLMChunk = { kind: "tool_call_args", id: "c1", args_delta: "{" };
    const end: LLMChunk = { kind: "tool_call_end", id: "c1" };
    const usage: LLMChunk = { kind: "usage", usage: { input: 100, output: 50 } };
    const done: LLMChunk = { kind: "done" };
    const err: LLMChunk = { kind: "error", error: "oops" };
    void [text, start, args, end, usage, done, err];
  });

  it("LLMProvider.call returns AsyncIterable<LLMChunk>", () => {
    const fakeProvider: LLMProvider = {
      name: "fake",
      tiers: [1],
      async *call(_req: LLMRequest) {
        yield { kind: "text", text: "ok" } as const;
        yield { kind: "done" } as const;
      },
    };
    expectTypeOf(fakeProvider.call).returns.toMatchTypeOf<AsyncIterable<LLMChunk>>();
  });
});
