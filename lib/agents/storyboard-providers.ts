/**
 * Storyboard-specific LLMProvider implementations that route through
 * server-side Next.js API proxies instead of hitting provider APIs
 * directly. Used by lib/agents/gemini (and future claude/openai)
 * plugins in Phase 13.5b.
 *
 * The browser never sees the provider API key - it's injected
 * server-side by the /api/agent/gemini (and claude, openai) routes.
 */

import type { LLMProvider } from "@livepeer/agent";

// These types live in @livepeer/agent but aren't re-exported from the
// package index. Use structural compatibility via the LLMProvider interface
// and define the shapes inline.

type Tier = 0 | 1 | 2 | 3;

interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface TokenUsage {
  input: number;
  output: number;
  cached?: number;
}

type LLMChunk =
  | { kind: "text"; text: string }
  | { kind: "tool_call_start"; id: string; name: string }
  | { kind: "tool_call_args"; id: string; args_delta: string }
  | { kind: "tool_call_end"; id: string }
  | { kind: "usage"; usage: TokenUsage }
  | { kind: "done" }
  | { kind: "error"; error: string };

interface LLMRequest {
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_name?: string;
    tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  }>;
  tools: ToolSchema[];
  tier: Tier;
  temperature?: number;
  max_tokens?: number;
  cacheable_prefix_count?: number;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; id?: string; args: Record<string, unknown> };
  functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
}

interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content: { role: string; parts: GeminiPart[] };
    finishReason?: string;
  }>;
  error?: { message: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

export class StoryboardGeminiProvider implements LLMProvider {
  readonly name = "gemini-proxy";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  constructor(private proxyUrl: string = "/api/agent/gemini") {}

  async *call(req: LLMRequest): AsyncIterable<LLMChunk> {
    const body = this.buildBody(req);
    let resp: Response;
    try {
      resp = await fetch(this.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      yield { kind: "error", error: `Gemini proxy fetch failed: ${e instanceof Error ? e.message : String(e)}` };
      return;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      if (resp.status === 429) {
        yield { kind: "error", error: "Rate limited — please wait a moment and try again." };
        return;
      }
      if (resp.status === 500 && text.includes("GEMINI_API_KEY")) {
        yield { kind: "error", error: "GEMINI_API_KEY not configured. Add it via Vercel env vars or .env.local." };
        return;
      }
      yield { kind: "error", error: `Gemini proxy ${resp.status}: ${text.slice(0, 200)}` };
      return;
    }

    let data: GeminiResponse;
    try {
      data = (await resp.json()) as GeminiResponse;
    } catch (e) {
      yield { kind: "error", error: `Gemini proxy response not JSON: ${e instanceof Error ? e.message : String(e)}` };
      return;
    }

    if (data.error) {
      yield { kind: "error", error: data.error.message };
      return;
    }

    const candidate = data.candidates?.[0];
    if (!candidate) {
      // Empty response — yield usage + done so the runner terminates cleanly
      if (data.usageMetadata) {
        yield {
          kind: "usage",
          usage: {
            input: data.usageMetadata.promptTokenCount ?? 0,
            output: data.usageMetadata.candidatesTokenCount ?? 0,
            cached: data.usageMetadata.cachedContentTokenCount ?? 0,
          },
        };
      }
      yield { kind: "done" };
      return;
    }

    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (typeof part.text === "string" && part.text.length > 0) {
        yield { kind: "text", text: part.text };
      }
      if (part.functionCall) {
        const id = part.functionCall.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
        yield { kind: "tool_call_start", id, name: part.functionCall.name };
        yield {
          kind: "tool_call_args",
          id,
          args_delta: JSON.stringify(part.functionCall.args ?? {}),
        };
        yield { kind: "tool_call_end", id };
      }
    }

    if (data.usageMetadata) {
      yield {
        kind: "usage",
        usage: {
          input: data.usageMetadata.promptTokenCount ?? 0,
          output: data.usageMetadata.candidatesTokenCount ?? 0,
          cached: data.usageMetadata.cachedContentTokenCount ?? 0,
        },
      };
    }
    yield { kind: "done" };
  }

  private buildBody(req: LLMRequest): Record<string, unknown> {
    // Translate portable Message[] into Gemini contents[] format
    const contents: GeminiMessage[] = [];
    let systemText = "";

    // Build tool_call_id → function name map so tool results can resolve their name
    const callIdToName = new Map<string, string>();
    for (const m of req.messages) {
      if (m.role === "assistant" && m.tool_calls) {
        for (const tc of m.tool_calls) {
          if (tc.id) callIdToName.set(tc.id, tc.name);
        }
      }
    }

    for (const m of req.messages) {
      if (m.role === "system") {
        systemText += (systemText ? "\n" : "") + m.content;
        continue;
      }
      if (m.role === "assistant") {
        if (m.tool_calls && m.tool_calls.length > 0) {
          contents.push({
            role: "model",
            parts: m.tool_calls.map((tc) => ({
              functionCall: { name: tc.name, args: tc.args },
            })),
          });
        } else if (m.content) {
          contents.push({ role: "model", parts: [{ text: m.content }] });
        }
        continue;
      }
      if (m.role === "tool") {
        // Gemini encodes tool results as a user-role message with functionResponse parts.
        // The runner stores tool results as JSON strings (from wrapStoryboardTool).
        // Parse back to object so Gemini sees the real data, not a nested JSON string.
        let responseObj: Record<string, unknown>;
        try {
          const parsed = JSON.parse(m.content);
          responseObj = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : { result: parsed };
        } catch {
          responseObj = { content: m.content };
        }
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: m.tool_name || (m.tool_call_id ? callIdToName.get(m.tool_call_id) : undefined) || "unknown_tool",
                response: responseObj,
              },
            },
          ],
        });
        continue;
      }
      // user
      contents.push({ role: "user", parts: [{ text: m.content }] });
    }

    // Sanitize: merge consecutive same-role messages (Gemini requires alternation)
    const sanitized: GeminiMessage[] = [];
    for (const msg of contents) {
      const last = sanitized[sanitized.length - 1];
      if (last && last.role === msg.role) {
        last.parts.push(...msg.parts);
      } else {
        sanitized.push(msg);
      }
    }

    // Ensure conversation starts with user
    if (sanitized.length > 0 && sanitized[0].role !== "user") {
      sanitized.unshift({ role: "user", parts: [{ text: "Continue." }] });
    }

    const body: Record<string, unknown> = {
      contents: sanitized,
    };
    if (systemText) {
      body.system_instruction = { parts: [{ text: systemText }] };
    }
    if (req.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t: ToolSchema) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    return body;
  }
}

// --- Claude ---

interface AnthropicTextBlock { type: "text"; text: string; }
interface AnthropicToolUseBlock { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; }
interface AnthropicToolResultBlock { type: "tool_result"; tool_use_id: string; content: string; }
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[] | string;
}

interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  _mcpResults?: Array<{ tool_use_id: string; name: string; result: string }>;
}

export interface StoryboardClaudeProviderOptions {
  proxyUrl?: string;
  /** MCP servers to pass through to the proxy. */
  getMcpServers?: () => unknown[];
}

export class StoryboardClaudeProvider implements LLMProvider {
  readonly name = "claude-proxy";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  constructor(private opts: StoryboardClaudeProviderOptions = {}) {}

  async *call(req: LLMRequest): AsyncIterable<LLMChunk> {
    const { messages, system } = this.buildBody(req);
    const tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    const body: Record<string, unknown> = { messages, system, tools };
    if (this.opts.getMcpServers) {
      body.mcpServers = this.opts.getMcpServers();
    }

    const resp = await fetch(this.opts.proxyUrl ?? "/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      if (resp.status === 429) {
        yield { kind: "error", error: "Rate limited — please wait a moment and try again." };
        return;
      }
      if (resp.status === 500 && text.includes("ANTHROPIC_API_KEY")) {
        yield { kind: "error", error: "ANTHROPIC_API_KEY not configured. Add it via Vercel env vars or .env.local." };
        return;
      }
      yield { kind: "error", error: `Claude proxy ${resp.status}: ${text.slice(0, 200)}` };
      return;
    }

    const data = (await resp.json()) as AnthropicResponse;

    for (const block of data.content ?? []) {
      if (block.type === "text" && block.text) {
        yield { kind: "text", text: block.text };
      }
      if (block.type === "tool_use") {
        yield { kind: "tool_call_start", id: block.id, name: block.name };
        yield { kind: "tool_call_args", id: block.id, args_delta: JSON.stringify(block.input ?? {}) };
        yield { kind: "tool_call_end", id: block.id };
      }
    }

    if (data.usage) {
      yield {
        kind: "usage",
        usage: {
          input: data.usage.input_tokens ?? 0,
          output: data.usage.output_tokens ?? 0,
        },
      };
    }
    yield { kind: "done" };
  }

  private buildBody(req: LLMRequest): { messages: AnthropicMessage[]; system: string } {
    let system = "";
    const messages: AnthropicMessage[] = [];
    for (const m of req.messages) {
      if (m.role === "system") {
        system += (system ? "\n" : "") + m.content;
        continue;
      }
      if (m.role === "assistant") {
        const blocks: AnthropicContentBlock[] = [];
        if (m.content) blocks.push({ type: "text", text: m.content });
        if (m.tool_calls) {
          for (const tc of m.tool_calls) {
            blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
          }
        }
        if (blocks.length > 0) messages.push({ role: "assistant", content: blocks });
        continue;
      }
      if (m.role === "tool") {
        messages.push({
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content },
          ],
        });
        continue;
      }
      // user
      messages.push({ role: "user", content: m.content });
    }
    // Merge consecutive same-role messages (Anthropic requires alternation)
    const merged: AnthropicMessage[] = [];
    for (const msg of messages) {
      const last = merged[merged.length - 1];
      if (last && last.role === msg.role) {
        // Concatenate content arrays (upgrade strings to text blocks)
        const lastBlocks = typeof last.content === "string"
          ? [{ type: "text" as const, text: last.content }]
          : last.content;
        const msgBlocks = typeof msg.content === "string"
          ? [{ type: "text" as const, text: msg.content }]
          : msg.content;
        merged[merged.length - 1] = { role: last.role, content: [...lastBlocks, ...msgBlocks] };
      } else {
        merged.push(msg);
      }
    }
    return { messages: merged, system };
  }
}

// --- OpenAI ---

interface OaiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OaiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OaiToolCall[];
  tool_call_id?: string;
}

interface OaiResponse {
  choices?: Array<{
    message: OaiMessage;
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message: string };
}

export class StoryboardOpenAIProvider implements LLMProvider {
  readonly name = "openai-proxy";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  constructor(private proxyUrl: string = "/api/agent/openai") {}

  async *call(req: LLMRequest): AsyncIterable<LLMChunk> {
    const messages = this.buildMessages(req);
    const tools = req.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const resp = await fetch(this.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, tools }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      yield { kind: "error", error: `OpenAI proxy ${resp.status}: ${text.slice(0, 200)}` };
      return;
    }

    const data = (await resp.json()) as OaiResponse;
    if (data.error) {
      yield { kind: "error", error: data.error.message };
      return;
    }

    const message = data.choices?.[0]?.message;
    if (message) {
      if (typeof message.content === "string" && message.content.length > 0) {
        yield { kind: "text", text: message.content };
      }
      if (message.tool_calls) {
        for (const tc of message.tool_calls) {
          yield { kind: "tool_call_start", id: tc.id, name: tc.function.name };
          yield { kind: "tool_call_args", id: tc.id, args_delta: tc.function.arguments };
          yield { kind: "tool_call_end", id: tc.id };
        }
      }
    }

    if (data.usage) {
      yield {
        kind: "usage",
        usage: {
          input: data.usage.prompt_tokens ?? 0,
          output: data.usage.completion_tokens ?? 0,
        },
      };
    }
    yield { kind: "done" };
  }

  private buildMessages(req: LLMRequest): OaiMessage[] {
    const out: OaiMessage[] = [];
    for (const m of req.messages) {
      if (m.role === "system") {
        out.push({ role: "system", content: m.content });
        continue;
      }
      if (m.role === "assistant") {
        if (m.tool_calls && m.tool_calls.length > 0) {
          out.push({
            role: "assistant",
            content: m.content || null,
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
          });
        } else {
          out.push({ role: "assistant", content: m.content });
        }
        continue;
      }
      if (m.role === "tool") {
        out.push({
          role: "tool",
          content: m.content,
          tool_call_id: m.tool_call_id ?? "",
        });
        continue;
      }
      // user
      out.push({ role: "user", content: m.content });
    }
    return out;
  }
}
