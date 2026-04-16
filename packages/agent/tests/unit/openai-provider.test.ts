import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../../src/providers/openai.js";

const ORIG_FETCH = globalThis.fetch;

beforeEach(() => {
  // Stub fetch
});

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

function mockSSE(lines: string[]): Response {
  // Each element is already a full SSE data line or [DONE]
  const body = lines
    .map((l) => (l === "[DONE]" ? "data: [DONE]\n\n" : `data: ${l}\n\n`))
    .join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("OpenAIProvider", () => {
  it("calls the correct URL with Authorization header", async () => {
    let calledUrl = "";
    let authHeader = "";
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calledUrl = url;
      authHeader = (init.headers as Record<string, string>)["Authorization"];
      return mockSSE([
        '{"choices":[{"delta":{"content":"hello"},"index":0}]}',
        '{"choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":5,"completion_tokens":3}}',
        "[DONE]",
      ]);
    }) as any;

    const p = new OpenAIProvider({ apiKey: "sk-test" });
    const chunks = [];
    for await (const c of p.call({ messages: [{ role: "user", content: "hi" }], tools: [], tier: 1 })) {
      chunks.push(c);
    }

    expect(calledUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect(authHeader).toBe("Bearer sk-test");
    expect(chunks.find((c) => c.kind === "text")).toEqual({ kind: "text", text: "hello" });
  });

  it("translates tools into OpenAI function schema", async () => {
    let sentBody: any;
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      sentBody = JSON.parse(init.body);
      return mockSSE([
        '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"do_thing","arguments":""}}]},"index":0}]}',
        '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"x\\":1}"}}]},"index":0}]}',
        '{"choices":[{"delta":{},"finish_reason":"tool_calls","index":0}],"usage":{"prompt_tokens":10,"completion_tokens":5}}',
        "[DONE]",
      ]);
    }) as any;

    const p = new OpenAIProvider({ apiKey: "k" });
    const chunks = [];
    for await (const c of p.call({
      messages: [{ role: "user", content: "do thing" }],
      tools: [{ name: "do_thing", description: "test", parameters: { type: "object" } }],
      tier: 2,
    })) {
      chunks.push(c);
    }

    expect(sentBody.tools[0].type).toBe("function");
    expect(sentBody.tools[0].function.name).toBe("do_thing");

    const callStart = chunks.find((c) => c.kind === "tool_call_start");
    expect(callStart).toBeDefined();
    if (callStart?.kind === "tool_call_start") {
      expect(callStart.name).toBe("do_thing");
    }
  });

  it("returns an error chunk on non-200 response", async () => {
    globalThis.fetch = vi.fn(async () => new Response("Bad Request", { status: 400 })) as any;
    const p = new OpenAIProvider({ apiKey: "k" });
    const chunks = [];
    for await (const c of p.call({ messages: [], tools: [], tier: 1 })) {
      chunks.push(c);
    }
    expect(chunks[0].kind).toBe("error");
    if (chunks[0].kind === "error") {
      expect(chunks[0].error).toContain("400");
    }
  });

  it("parses usage from the final chunk before [DONE]", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockSSE([
        '{"choices":[{"delta":{"content":"hi"},"index":0}]}',
        '{"choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":50,"completion_tokens":10}}',
        "[DONE]",
      ]),
    ) as any;

    const p = new OpenAIProvider({ apiKey: "k" });
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
