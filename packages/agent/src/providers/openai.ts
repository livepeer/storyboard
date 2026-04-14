/**
 * OpenAI provider plugin. Translates portable LLMRequest into the
 * OpenAI Chat Completions streaming API and yields LLMChunks.
 *
 * Models served:
 *   Tier 0: gpt-4o-mini
 *   Tier 1: gpt-4o-mini
 *   Tier 2: gpt-4o
 *   Tier 3: gpt-4o
 *
 * Constructor accepts OpenAIConfig so OllamaProvider can subclass
 * with a different endpoint and default models.
 *
 * [INV-9]: this file is the ONLY place openai-specific code lives.
 */

import type { LLMProvider, LLMRequest, LLMChunk, ToolSchema } from "./types.js";
import type { Tier, TokenUsage } from "../types.js";

export interface OpenAIConfig {
  apiKey: string;
  /** Override the API endpoint (used by Ollama subclass). */
  endpoint?: string;
  /** Per-tier model override. */
  models?: Partial<Record<Tier, string>>;
}

const DEFAULT_MODELS: Record<Tier, string> = {
  0: "gpt-4o-mini",
  1: "gpt-4o-mini",
  2: "gpt-4o",
  3: "gpt-4o",
};

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  protected readonly endpoint: string;
  protected readonly defaultModels: Record<Tier, string>;

  constructor(protected config: OpenAIConfig) {
    this.endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
    this.defaultModels = DEFAULT_MODELS;
  }

  async *call(req: LLMRequest, signal?: AbortSignal): AsyncIterable<LLMChunk> {
    const model = this.config.models?.[req.tier] ?? this.defaultModels[req.tier];
    const messages = this.buildMessages(req);

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(req.tools.length > 0
        ? { tools: req.tools.map((t) => this.toolToFunction(t)) }
        : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.max_tokens !== undefined ? { max_tokens: req.max_tokens } : {}),
    };

    const resp = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      yield { kind: "error", error: `OpenAI ${resp.status}: ${errText.slice(0, 200)}` };
      return;
    }

    if (!resp.body) {
      yield { kind: "error", error: "OpenAI returned no body" };
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalUsage: TokenUsage | undefined;

    // Track partial tool_calls being assembled across deltas
    // key: call index, value: {id, name, args_parts}
    const partialCalls: Map<number, { id: string; name: string; argsStarted: boolean }> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        if (!data) continue;

        try {
          const parsed = JSON.parse(data);

          // Usage appears in the final chunk (stream_options.include_usage)
          if (parsed.usage) {
            totalUsage = {
              input: parsed.usage.prompt_tokens ?? 0,
              output: parsed.usage.completion_tokens ?? 0,
            };
          }

          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // Text delta
          if (typeof delta.content === "string" && delta.content.length > 0) {
            yield { kind: "text", text: delta.content };
          }

          // Tool call deltas
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index as number;

              if (tc.id) {
                // First delta for this call — emit start
                partialCalls.set(idx, { id: tc.id, name: tc.function?.name ?? "", argsStarted: false });
                yield { kind: "tool_call_start", id: tc.id, name: tc.function?.name ?? "" };
              }

              const call = partialCalls.get(idx);
              if (call && tc.function?.arguments) {
                yield { kind: "tool_call_args", id: call.id, args_delta: tc.function.arguments };
              }
            }
          }
        } catch {
          /* skip malformed chunks */
        }
      }
    }

    // Emit tool_call_end for all completed calls
    for (const [, call] of partialCalls) {
      yield { kind: "tool_call_end", id: call.id };
    }

    if (totalUsage) yield { kind: "usage", usage: totalUsage };
    yield { kind: "done" };
  }

  private buildMessages(req: LLMRequest): unknown[] {
    const messages: unknown[] = [];
    for (const m of req.messages) {
      if (m.role === "system") {
        messages.push({ role: "system", content: m.content });
      } else if (m.role === "assistant") {
        if (m.tool_calls && m.tool_calls.length > 0) {
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.args) },
            })),
          });
        } else {
          messages.push({ role: "assistant", content: m.content });
        }
      } else if (m.role === "tool") {
        messages.push({
          role: "tool",
          tool_call_id: m.tool_call_id ?? "",
          content: m.content,
        });
      } else {
        messages.push({ role: "user", content: m.content });
      }
    }
    return messages;
  }

  private toolToFunction(t: ToolSchema): unknown {
    return {
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    };
  }
}
