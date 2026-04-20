/**
 * LivepeerProvider — routes LLM calls through Livepeer's BYOC infrastructure.
 *
 * Uses the OpenAI chat completions format as the wire protocol.
 * The server-side proxy (/api/llm/chat) forwards to the SDK service,
 * which translates to the backend-specific format (Gemini, Claude, etc.)
 *
 * Benefits:
 * - One API key (Daydream) for all LLM + media generation
 * - Livepeer can add new LLM backends without client changes
 * - Same LLMProvider interface as GeminiProvider/ClaudeProvider
 */

// Structural compatibility with @livepeer/agent — no import needed
type Tier = 0 | 1 | 2 | 3;

interface TokenUsage {
  input: number;
  output: number;
  cached?: number;
}

interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_name?: string;
  tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}

interface LLMRequest {
  messages: Message[];
  tools: ToolSchema[];
  tier: Tier;
  temperature?: number;
  max_tokens?: number;
}

type LLMChunk =
  | { kind: "text"; text: string }
  | { kind: "tool_call_start"; id: string; name: string }
  | { kind: "tool_call_args"; id: string; args_delta: string }
  | { kind: "tool_call_end"; id: string }
  | { kind: "usage"; usage: TokenUsage }
  | { kind: "done" }
  | { kind: "error"; error: string };

interface LLMProvider {
  readonly name: string;
  readonly tiers: Tier[];
  call(req: LLMRequest, signal?: AbortSignal): AsyncIterable<LLMChunk>;
}

// ── OpenAI wire format types ──

interface OaiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface OaiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OaiResponse {
  choices?: Array<{
    message: OaiMessage;
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message: string };
}

// ── Translation helpers ──

function translateMessages(messages: Message[]): OaiMessage[] {
  const out: OaiMessage[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        content: m.content,
        tool_call_id: m.tool_call_id ?? "",
      });
    } else if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function translateTools(tools: ToolSchema[]): OaiTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ── Provider ──

const DEFAULT_MODELS: Record<Tier, string> = {
  0: "gemini-2.5-flash",
  1: "gemini-2.5-flash",
  2: "gemini-2.5-pro",
  3: "gemini-2.5-pro",
};

export interface LivepeerProviderConfig {
  /** Proxy endpoint URL. Default: "/api/llm/chat" */
  proxyUrl?: string;
  /** Default model. Default: "gemini-2.5-flash" */
  model?: string;
  /** Per-tier model overrides */
  models?: Partial<Record<Tier, string>>;
}

export class LivepeerProvider implements LLMProvider {
  readonly name = "livepeer";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  constructor(private config: LivepeerProviderConfig = {}) {}

  async *call(req: LLMRequest, signal?: AbortSignal): AsyncIterable<LLMChunk> {
    const model = this.config.models?.[req.tier]
      ?? this.config.model
      ?? DEFAULT_MODELS[req.tier];

    const body: Record<string, unknown> = {
      model,
      messages: translateMessages(req.messages),
    };
    if (req.tools.length > 0) {
      body.tools = translateTools(req.tools);
    }
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.max_tokens !== undefined) body.max_tokens = req.max_tokens;

    let resp: Response;
    try {
      resp = await fetch(this.config.proxyUrl ?? "/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      yield { kind: "error", error: `Livepeer LLM fetch failed: ${e instanceof Error ? e.message : String(e)}` };
      return;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      if (resp.status === 429) {
        yield { kind: "error", error: "Rate limited — please wait a moment and try again." };
        return;
      }
      yield { kind: "error", error: `Livepeer LLM ${resp.status}: ${text.slice(0, 200)}` };
      return;
    }

    let data: OaiResponse;
    try {
      data = await resp.json();
    } catch (e) {
      yield { kind: "error", error: `Response not JSON: ${e instanceof Error ? e.message : "parse error"}` };
      return;
    }

    if (data.error) {
      yield { kind: "error", error: data.error.message };
      return;
    }

    const choice = data.choices?.[0];
    if (!choice) {
      // Empty response — yield usage + done
      if (data.usage) {
        yield { kind: "usage", usage: {
          input: data.usage.prompt_tokens ?? 0,
          output: data.usage.completion_tokens ?? 0,
        }};
      }
      yield { kind: "done" };
      return;
    }

    const msg = choice.message;

    // Yield text content
    if (typeof msg.content === "string" && msg.content.length > 0) {
      yield { kind: "text", text: msg.content };
    }

    // Yield tool calls
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        yield { kind: "tool_call_start", id: tc.id, name: tc.function.name };
        yield { kind: "tool_call_args", id: tc.id, args_delta: tc.function.arguments };
        yield { kind: "tool_call_end", id: tc.id };
      }
    }

    // Yield usage
    if (data.usage) {
      yield { kind: "usage", usage: {
        input: data.usage.prompt_tokens ?? 0,
        output: data.usage.completion_tokens ?? 0,
      }};
    }

    yield { kind: "done" };
  }
}
