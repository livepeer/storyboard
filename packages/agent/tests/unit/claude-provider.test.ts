import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClaudeProvider } from "../../src/providers/claude.js";

const ORIG_FETCH = globalThis.fetch;

beforeEach(() => {
  // Stub fetch
});

afterEach(() => {
  globalThis.fetch = ORIG_FETCH;
});

function mockSSE(events: Array<{ event: string; data: string }>): Response {
  const body = events.map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join("");
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("ClaudeProvider", () => {
  it("calls the correct URL with x-api-key header", async () => {
    let calledUrl = "";
    let calledHeaders: Record<string, string> = {};
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calledUrl = url;
      calledHeaders = Object.fromEntries(
        Object.entries(init.headers as Record<string, string>),
      );
      return mockSSE([
        { event: "message_start", data: '{"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":5,"output_tokens":0}}}' },
        { event: "content_block_start", data: '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}' },
        { event: "content_block_delta", data: '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}' },
        { event: "content_block_stop", data: '{"type":"content_block_stop","index":0}' },
        { event: "message_delta", data: '{"type":"message_delta","delta":{},"usage":{"output_tokens":3}}' },
        { event: "message_stop", data: '{"type":"message_stop"}' },
      ]);
    }) as any;

    const p = new ClaudeProvider({ apiKey: "test-api-key" });
    const chunks = [];
    for await (const c of p.call({ messages: [{ role: "user", content: "hi" }], tools: [], tier: 1 })) {
      chunks.push(c);
    }

    expect(calledUrl).toBe("https://api.anthropic.com/v1/messages");
    expect(calledHeaders["x-api-key"]).toBe("test-api-key");
    expect(calledHeaders["anthropic-version"]).toBe("2023-06-01");
    expect(chunks.find((c) => c.kind === "text")).toEqual({ kind: "text", text: "hello" });
  });

  it("translates assistant tool_calls into tool_use content blocks", async () => {
    let sentBody: any;
    globalThis.fetch = vi.fn(async (_url: any, init: any) => {
      sentBody = JSON.parse(init.body);
      return mockSSE([
        { event: "message_start", data: '{"type":"message_start","message":{"usage":{"input_tokens":10}}}' },
        { event: "message_delta", data: '{"type":"message_delta","delta":{},"usage":{"output_tokens":2}}' },
        { event: "message_stop", data: '{"type":"message_stop"}' },
      ]);
    }) as any;

    const p = new ClaudeProvider({ apiKey: "k" });
    for await (const _ of p.call({
      messages: [
        { role: "user", content: "do thing" },
        {
          role: "assistant",
          content: "",
          tool_calls: [{ id: "tc_1", name: "do_thing", args: { x: 1 } }],
        },
        { role: "tool", content: "result", tool_call_id: "tc_1", tool_name: "do_thing" },
      ],
      tools: [{ name: "do_thing", description: "test", parameters: { type: "object" } }],
      tier: 2,
    })) {
      /* drain */
    }

    // assistant message should have tool_use block
    const assistantMsg = sentBody.messages.find((m: any) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.content[0].type).toBe("tool_use");
    expect(assistantMsg.content[0].name).toBe("do_thing");

    // tool result should be wrapped
    const toolMsg = sentBody.messages.find((m: any) => m.role === "user" && m.content[0]?.type === "tool_result");
    expect(toolMsg).toBeDefined();
    expect(toolMsg.content[0].tool_use_id).toBe("tc_1");
  });

  it("returns an error chunk on non-200 response", async () => {
    globalThis.fetch = vi.fn(async () => new Response("Unauthorized", { status: 401 })) as any;
    const p = new ClaudeProvider({ apiKey: "bad-key" });
    const chunks = [];
    for await (const c of p.call({ messages: [], tools: [], tier: 1 })) {
      chunks.push(c);
    }
    expect(chunks[0].kind).toBe("error");
    if (chunks[0].kind === "error") {
      expect(chunks[0].error).toContain("401");
    }
  });

  it("parses usage from message_delta event", async () => {
    globalThis.fetch = vi.fn(async () =>
      mockSSE([
        { event: "message_start", data: '{"type":"message_start","message":{"usage":{"input_tokens":50}}}' },
        { event: "content_block_start", data: '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}' },
        { event: "content_block_delta", data: '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}' },
        { event: "content_block_stop", data: '{"type":"content_block_stop","index":0}' },
        { event: "message_delta", data: '{"type":"message_delta","delta":{},"usage":{"output_tokens":10}}' },
        { event: "message_stop", data: '{"type":"message_stop"}' },
      ]),
    ) as any;

    const p = new ClaudeProvider({ apiKey: "k" });
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
