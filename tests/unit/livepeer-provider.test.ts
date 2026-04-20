import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the translation logic and chunk parsing by mocking fetch
// and verifying the LivepeerProvider yields correct LLMChunks.

// Import the provider — it uses structural types so no @livepeer/agent import needed
import { LivepeerProvider } from "@/lib/agents/livepeer-provider";

describe("LivepeerProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("translates LLMRequest to OpenAI format and sends to proxy", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }));
    });

    const provider = new LivepeerProvider({ proxyUrl: "/api/llm/chat" });
    const chunks: unknown[] = [];
    for await (const chunk of provider.call({
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi" },
      ],
      tools: [],
      tier: 1,
    })) {
      chunks.push(chunk);
    }

    // Verify fetch was called with OpenAI format
    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.model).toBe("gemini-2.5-flash");
    expect(capturedBody!.messages).toHaveLength(2);
    expect((capturedBody!.messages as Array<{ role: string }>)[0].role).toBe("system");

    // Verify chunks
    const textChunk = chunks.find((c: any) => c.kind === "text");
    expect(textChunk).toEqual({ kind: "text", text: "Hello!" });
    const usageChunk = chunks.find((c: any) => c.kind === "usage");
    expect(usageChunk).toEqual({ kind: "usage", usage: { input: 10, output: 5 } });
    expect(chunks[chunks.length - 1]).toEqual({ kind: "done" });
  });

  it("parses tool_calls into tool_call_start/args/end chunks", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: "assistant",
            content: "I'll create that for you",
            tool_calls: [{
              id: "call_abc",
              type: "function",
              function: { name: "generate_image", arguments: '{"prompt":"sunset"}' },
            }],
          },
          finish_reason: "tool_calls",
        }],
        usage: { prompt_tokens: 20, completion_tokens: 15 },
      }));
    });

    const provider = new LivepeerProvider();
    const chunks: unknown[] = [];
    for await (const chunk of provider.call({
      messages: [{ role: "user", content: "create sunset" }],
      tools: [{ name: "generate_image", description: "Generate image", parameters: {} }],
      tier: 1,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({ kind: "text", text: "I'll create that for you" });
    expect(chunks).toContainEqual({ kind: "tool_call_start", id: "call_abc", name: "generate_image" });
    expect(chunks).toContainEqual({ kind: "tool_call_args", id: "call_abc", args_delta: '{"prompt":"sunset"}' });
    expect(chunks).toContainEqual({ kind: "tool_call_end", id: "call_abc" });
  });

  it("sends tools in OpenAI format", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }));
    });

    const provider = new LivepeerProvider();
    for await (const _ of provider.call({
      messages: [{ role: "user", content: "test" }],
      tools: [{
        name: "my_tool",
        description: "Does stuff",
        parameters: { type: "object", properties: { x: { type: "string" } } },
      }],
      tier: 0,
    })) { /* consume */ }

    const tools = capturedBody!.tools as Array<{ type: string; function: { name: string } }>;
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe("function");
    expect(tools[0].function.name).toBe("my_tool");
  });

  it("translates assistant tool_calls in message history", async () => {
    let capturedBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
      }));
    });

    const provider = new LivepeerProvider();
    for await (const _ of provider.call({
      messages: [
        { role: "user", content: "create image" },
        {
          role: "assistant", content: "Creating...",
          tool_calls: [{ id: "tc1", name: "gen", args: { prompt: "cat" } }],
        },
        { role: "tool", content: '{"url":"https://..."}', tool_call_id: "tc1" },
      ],
      tools: [],
      tier: 1,
    })) { /* consume */ }

    const msgs = capturedBody!.messages as Array<{ role: string; tool_calls?: unknown[]; tool_call_id?: string }>;
    expect(msgs).toHaveLength(3);
    // Assistant message has tool_calls in OpenAI format
    expect(msgs[1].tool_calls).toHaveLength(1);
    // Tool result has tool_call_id
    expect(msgs[2].role).toBe("tool");
    expect(msgs[2].tool_call_id).toBe("tc1");
  });

  it("supports per-tier model selection", async () => {
    let capturedModel = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      capturedModel = (JSON.parse(init?.body as string) as Record<string, unknown>).model as string;
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      }));
    });

    const provider = new LivepeerProvider({
      models: { 0: "gemini-2.5-flash", 2: "gemini-2.5-pro", 3: "claude-sonnet-4-6" },
    });

    for await (const _ of provider.call({ messages: [{ role: "user", content: "x" }], tools: [], tier: 0 })) {}
    expect(capturedModel).toBe("gemini-2.5-flash");

    for await (const _ of provider.call({ messages: [{ role: "user", content: "x" }], tools: [], tier: 2 })) {}
    expect(capturedModel).toBe("gemini-2.5-pro");

    for await (const _ of provider.call({ messages: [{ role: "user", content: "x" }], tools: [], tier: 3 })) {}
    expect(capturedModel).toBe("claude-sonnet-4-6");
  });

  it("handles HTTP error responses", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const provider = new LivepeerProvider();
    const chunks: unknown[] = [];
    for await (const chunk of provider.call({
      messages: [{ role: "user", content: "test" }], tools: [], tier: 1,
    })) {
      chunks.push(chunk);
    }

    const errChunk = chunks.find((c: any) => c.kind === "error") as { kind: string; error: string };
    expect(errChunk).toBeTruthy();
    expect(errChunk.error).toContain("500");
  });

  it("handles rate limiting (429)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("Too Many Requests", { status: 429 });
    });

    const provider = new LivepeerProvider();
    const chunks: unknown[] = [];
    for await (const chunk of provider.call({
      messages: [{ role: "user", content: "test" }], tools: [], tier: 1,
    })) {
      chunks.push(chunk);
    }

    const errChunk = chunks.find((c: any) => c.kind === "error") as { kind: string; error: string };
    expect(errChunk.error).toContain("Rate limited");
  });

  it("handles empty choices", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 0 },
      }));
    });

    const provider = new LivepeerProvider();
    const chunks: unknown[] = [];
    for await (const chunk of provider.call({
      messages: [{ role: "user", content: "test" }], tools: [], tier: 1,
    })) {
      chunks.push(chunk);
    }

    // Should get usage + done, no error
    expect(chunks).toContainEqual({ kind: "usage", usage: { input: 5, output: 0 } });
    expect(chunks[chunks.length - 1]).toEqual({ kind: "done" });
  });

  it("handles network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("Failed to fetch");
    });

    const provider = new LivepeerProvider();
    const chunks: unknown[] = [];
    for await (const chunk of provider.call({
      messages: [{ role: "user", content: "test" }], tools: [], tier: 1,
    })) {
      chunks.push(chunk);
    }

    const errChunk = chunks.find((c: any) => c.kind === "error") as { kind: string; error: string };
    expect(errChunk.error).toContain("Failed to fetch");
  });
});
