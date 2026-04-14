import { describe, it, expectTypeOf } from "vitest";
import type { Message, Tier } from "../../src/types.js";

describe("core types", () => {
  it("Message accepts assistant + tool_calls", () => {
    const m: Message = {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "call_1", name: "create_media", args: { prompt: "a cat" } }],
    };
    expectTypeOf(m).toMatchTypeOf<Message>();
  });

  it("Tier is restricted to 0..3", () => {
    const valid: Tier = 1;
    expectTypeOf(valid).toEqualTypeOf<Tier>();
    // @ts-expect-error — Tier 4 is not allowed
    const invalid: Tier = 4;
    void invalid;
  });
});
