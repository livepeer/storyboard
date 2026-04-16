import { describe, it, expect } from "vitest";
import { BuiltinProvider } from "../../src/providers/builtin.js";
import { NoneProvider } from "../../src/providers/none.js";

describe("BuiltinProvider", () => {
  it("yields done after empty text", async () => {
    const p = new BuiltinProvider();
    const chunks = [];
    for await (const c of p.call({ messages: [], tools: [], tier: 0 })) {
      chunks.push(c);
    }
    const kinds = chunks.map((c) => c.kind);
    expect(kinds).toContain("text");
    expect(kinds).toContain("done");
    const textChunk = chunks.find((c) => c.kind === "text");
    if (textChunk?.kind === "text") {
      expect(textChunk.text).toBe("");
    }
  });

  it("has tiers === [0]", () => {
    const p = new BuiltinProvider();
    expect(p.tiers).toEqual([0]);
  });
});

describe("NoneProvider", () => {
  it("always yields an error chunk", async () => {
    const p = new NoneProvider();
    const chunks = [];
    for await (const c of p.call({ messages: [{ role: "user", content: "hi" }], tools: [], tier: 1 })) {
      chunks.push(c);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].kind).toBe("error");
  });

  it("has tiers === []", () => {
    const p = new NoneProvider();
    expect(p.tiers).toEqual([]);
  });
});
