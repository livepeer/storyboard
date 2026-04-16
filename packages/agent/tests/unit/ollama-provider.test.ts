import { describe, it, expect, vi, afterEach } from "vitest";
import { OllamaProvider } from "../../src/providers/ollama.js";

const ORIG_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

describe("OllamaProvider", () => {
  it("defaults to localhost:11434/v1 endpoint", async () => {
    let calledUrl = "";
    globalThis.fetch = vi.fn(async (url: any) => {
      calledUrl = url;
      return new Response(
        'data: {"choices":[{"delta":{"content":"hi"},"index":0}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\ndata: [DONE]\n\n',
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }) as any;

    const p = new OllamaProvider();
    for await (const _ of p.call({ messages: [{ role: "user", content: "hi" }], tools: [], tier: 1 })) {
      /* drain */
    }
    expect(calledUrl).toContain("localhost:11434");
  });

  it("has name === 'ollama'", () => {
    const p = new OllamaProvider();
    expect(p.name).toBe("ollama");
  });
});
