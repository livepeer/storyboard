import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini.js";

const ORIG_FETCH = globalThis.fetch;

beforeEach(() => {
  // Stub fetch
});

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

function mockSSE(events: string[]): Response {
  const body = events.map((e) => `data: ${e}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("GeminiProvider", () => {
  it("calls the right endpoint with the API key", async () => {
    let calledUrl = "";
    globalThis.fetch = vi.fn(async (url: any) => {
      calledUrl = url;
      return mockSSE(['{"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}']);
    }) as any;
    const p = new GeminiProvider({ apiKey: "test-key" });
    const chunks = [];
    for await (const c of p.call({ messages: [{ role: "user", content: "hi" }], tools: [], tier: 1 })) {
      chunks.push(c);
    }
    expect(calledUrl).toContain("key=test-key");
    expect(calledUrl).toContain("gemini-2.5-flash");
    expect(chunks.find((c) => c.kind === "text")).toEqual({ kind: "text", text: "hi" });
  });

  it("translates LLMRequest tool calls into Gemini functionDeclarations", async () => {
    let body: any;
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      body = JSON.parse(init.body);
      return mockSSE(['{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}']);
    }) as any;
    const p = new GeminiProvider({ apiKey: "k" });
    for await (const _ of p.call({
      messages: [{ role: "user", content: "do thing" }],
      tools: [{ name: "do_thing", description: "test", parameters: { type: "object" } }],
      tier: 1,
    })) {
      /* drain */
    }
    expect(body.tools[0].functionDeclarations[0].name).toBe("do_thing");
  });

  it("returns an error chunk on non-200 response", async () => {
    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as any;
    const p = new GeminiProvider({ apiKey: "k" });
    const chunks = [];
    for await (const c of p.call({ messages: [], tools: [], tier: 1 })) {
      chunks.push(c);
    }
    expect(chunks[0].kind).toBe("error");
  });

  it("parses usage metadata from the final chunk", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockSSE([
        '{"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}',
        '{"usageMetadata":{"promptTokenCount":50,"candidatesTokenCount":10}}',
      ]),
    ) as any;
    const p = new GeminiProvider({ apiKey: "k" });
    const chunks = [];
    for await (const c of p.call({ messages: [], tools: [], tier: 1 })) {
      chunks.push(c);
    }
    const usage = chunks.find((c) => c.kind === "usage");
    expect(usage).toBeDefined();
    if (usage?.kind === "usage") {
      expect(usage.usage.input).toBe(50);
      expect(usage.usage.output).toBe(10);
    }
  });
});
