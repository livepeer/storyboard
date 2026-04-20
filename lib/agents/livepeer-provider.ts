/**
 * LivepeerProvider — routes LLM calls through Livepeer's BYOC infrastructure.
 *
 * Instead of calling Gemini/Claude APIs directly, this provider sends
 * requests through the SDK /inference endpoint with capability "gemini-text".
 * The BYOC orch routes to the Gemini API via its serverless adapter.
 *
 * Benefits:
 * - No separate Gemini API key needed — uses the Daydream API key
 * - Livepeer can add more LLM providers (OpenRouter, Claude, Llama)
 *   as BYOC capabilities — this provider picks them up automatically
 * - All AI calls go through one billing/auth path
 *
 * Limitation: currently only supports simple text completion (no tool calling)
 * because the BYOC gemini-text capability only accepts {prompt} payloads.
 * Tool calling requires the full Gemini generateContent API format which
 * the BYOC adapter doesn't support yet. When it does, this provider
 * will support full agent tool use.
 */

// LLMProvider types (structural compatibility with @livepeer/agent)
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

export interface LivepeerProviderConfig {
  /** SDK service URL. Default: reads from localStorage or "https://sdk.daydream.monster" */
  sdkUrl?: string;
  /** Daydream API key. Default: reads from localStorage */
  apiKey?: string;
  /** LLM capability name on the BYOC orch. Default: "gemini-text" */
  capability?: string;
}

export class LivepeerProvider implements LLMProvider {
  readonly name = "livepeer";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  private sdkUrl: string;
  private apiKey: string;
  private capability: string;

  constructor(config: LivepeerProviderConfig = {}) {
    this.sdkUrl = config.sdkUrl
      || (typeof window !== "undefined" && localStorage.getItem("sdk_service_url"))
      || "https://sdk.daydream.monster";
    this.apiKey = config.apiKey
      || (typeof window !== "undefined" && localStorage.getItem("sdk_api_key"))
      || "";
    this.capability = config.capability || "gemini-text";
  }

  async *call(req: LLMRequest, signal?: AbortSignal): AsyncIterable<LLMChunk> {
    // Build the prompt from messages (simple concatenation for text completion)
    // The BYOC gemini-text capability accepts {prompt, max_output_tokens}
    const systemMsg = req.messages.find((m) => m.role === "system");
    const userMsgs = req.messages.filter((m) => m.role === "user" || m.role === "assistant");

    let prompt = "";
    if (systemMsg) prompt += `System: ${systemMsg.content}\n\n`;
    for (const m of userMsgs) {
      prompt += `${m.role === "user" ? "User" : "Assistant"}: ${m.content}\n`;
    }

    // If tools are provided, include their schemas in the prompt
    // (workaround until BYOC supports native tool calling)
    if (req.tools.length > 0) {
      prompt += "\n\nAvailable tools (respond with JSON function calls if needed):\n";
      for (const tool of req.tools) {
        prompt += `- ${tool.name}: ${tool.description}\n`;
      }
      prompt += "\nRespond with text. If you need to call a tool, respond with:\n";
      prompt += '{"tool_call": {"name": "tool_name", "args": {...}}}\n';
      prompt += "\nAssistant:";
    }

    const payload: Record<string, unknown> = {
      capability: this.capability,
      prompt,
    };
    if (req.max_tokens) {
      payload.params = { max_output_tokens: req.max_tokens };
    }

    try {
      const resp = await fetch(`${this.sdkUrl}/inference`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        yield { kind: "error", error: `Livepeer LLM ${resp.status}: ${errText.slice(0, 200)}` };
        return;
      }

      const result = await resp.json();
      const data = (result.data ?? result) as Record<string, unknown>;

      // Extract text from various response formats
      const text = (data.text as string)
        || (data.output as string)
        || (result.text as string)
        || "";

      if (!text) {
        yield { kind: "error", error: "Livepeer LLM returned no text" };
        return;
      }

      // Check if the response contains a tool call (JSON format)
      const toolCallMatch = text.match(/\{"tool_call":\s*\{/);
      if (toolCallMatch) {
        try {
          const jsonStart = text.indexOf('{"tool_call"');
          const parsed = JSON.parse(text.slice(jsonStart));
          const tc = parsed.tool_call;
          if (tc?.name) {
            const callId = `call_${Math.random().toString(36).slice(2, 10)}`;
            yield { kind: "tool_call_start", id: callId, name: tc.name };
            yield { kind: "tool_call_args", id: callId, args_delta: JSON.stringify(tc.args || {}) };
            yield { kind: "tool_call_end", id: callId };
          }
          // Also yield any text before the tool call
          const textBefore = text.slice(0, jsonStart).trim();
          if (textBefore) yield { kind: "text", text: textBefore };
        } catch {
          // Not valid JSON — just yield as text
          yield { kind: "text", text };
        }
      } else {
        yield { kind: "text", text };
      }

      // Token usage estimate (BYOC doesn't return exact counts)
      yield {
        kind: "usage",
        usage: {
          input: Math.ceil(prompt.length / 4),
          output: Math.ceil(text.length / 4),
        },
      };
    } catch (e) {
      yield { kind: "error", error: `Livepeer LLM: ${e instanceof Error ? e.message : "unknown"}` };
    }

    yield { kind: "done" };
  }
}
