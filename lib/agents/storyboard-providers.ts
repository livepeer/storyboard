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
                name: m.tool_name ?? "",
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
