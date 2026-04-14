/**
 * Claude provider plugin. Translates portable LLMRequest into the
 * Anthropic Messages API format and streams the response back as LLMChunks.
 *
 * Models served:
 *   Tier 0: claude-haiku-4-5-20251001
 *   Tier 1: claude-haiku-4-5-20251001
 *   Tier 2: claude-sonnet-4-6
 *   Tier 3: claude-opus-4-6
 *
 * [INV-9]: this file is the ONLY place claude-specific code lives.
 */

import type { LLMProvider, LLMRequest, LLMChunk, ToolSchema } from "./types.js";
import type { Tier, TokenUsage } from "../types.js";

export interface ClaudeConfig {
  apiKey: string;
  /** Override the API endpoint for testing. */
  endpoint?: string;
  /** Per-tier model override. */
  models?: Partial<Record<Tier, string>>;
}

const DEFAULT_MODELS: Record<Tier, string> = {
  0: "claude-haiku-4-5-20251001",
  1: "claude-haiku-4-5-20251001",
  2: "claude-sonnet-4-6",
  3: "claude-opus-4-6",
};

const ANTHROPIC_API_VERSION = "2023-06-01";

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  constructor(private config: ClaudeConfig) {}

  async *call(req: LLMRequest, signal?: AbortSignal): AsyncIterable<LLMChunk> {
    const model = this.config.models?.[req.tier] ?? DEFAULT_MODELS[req.tier];
    const endpoint = this.config.endpoint ?? "https://api.anthropic.com/v1/messages";

    const { system, messages } = this.buildMessages(req);

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      max_tokens: req.max_tokens ?? 4096,
      ...(system ? { system } : {}),
      ...(req.tools.length > 0 ? { tools: req.tools.map((t) => this.toolToFunction(t)) } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      yield { kind: "error", error: `Claude ${resp.status}: ${errText.slice(0, 200)}` };
      return;
    }

    if (!resp.body) {
      yield { kind: "error", error: "Claude returned no body" };
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalUsage: TokenUsage = { input: 0, output: 0 };

    // Track open tool_use blocks by index
    const openBlocks: Map<number, { id: string; name: string }> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          for (const chunk of this.parseEvent(parsed, openBlocks, totalUsage)) {
            yield chunk;
          }
        } catch {
          /* skip malformed chunks */
        }
      }
    }

    yield { kind: "usage", usage: totalUsage };
    yield { kind: "done" };
  }

  private buildMessages(req: LLMRequest): { system: string | undefined; messages: unknown[] } {
    let system: string | undefined;
    const messages: unknown[] = [];
    const prefixCount = req.cacheable_prefix_count ?? 0;
    let msgIndex = 0;

    for (const m of req.messages) {
      if (m.role === "system") {
        system = m.content;
        continue;
      }

      const shouldCache = msgIndex < prefixCount;

      if (m.role === "assistant") {
        if (m.tool_calls && m.tool_calls.length > 0) {
          const content = m.tool_calls.map((tc) => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.args,
          }));
          messages.push({ role: "assistant", content });
        } else {
          const textBlock: Record<string, unknown> = { type: "text", text: m.content };
          if (shouldCache) textBlock.cache_control = { type: "ephemeral" };
          messages.push({ role: "assistant", content: [textBlock] });
        }
      } else if (m.role === "tool") {
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: m.tool_call_id ?? "",
              content: m.content,
            },
          ],
        });
      } else {
        // user
        const textBlock: Record<string, unknown> = { type: "text", text: m.content };
        if (shouldCache) textBlock.cache_control = { type: "ephemeral" };
        messages.push({ role: "user", content: [textBlock] });
      }

      msgIndex++;
    }

    return { system, messages };
  }

  private toolToFunction(t: ToolSchema): unknown {
    return {
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    };
  }

  private *parseEvent(
    parsed: any,
    openBlocks: Map<number, { id: string; name: string }>,
    totalUsage: TokenUsage,
  ): Iterable<LLMChunk> {
    const type = parsed.type as string;

    if (type === "message_start") {
      const usage = parsed.message?.usage;
      if (usage) {
        totalUsage.input = usage.input_tokens ?? 0;
        totalUsage.cached = usage.cache_read_input_tokens ?? 0;
      }
      return;
    }

    if (type === "content_block_start") {
      const block = parsed.content_block;
      if (block?.type === "tool_use") {
        const idx = parsed.index as number;
        openBlocks.set(idx, { id: block.id, name: block.name });
        yield { kind: "tool_call_start", id: block.id, name: block.name };
      }
      return;
    }

    if (type === "content_block_delta") {
      const delta = parsed.delta;
      if (!delta) return;

      if (delta.type === "text_delta") {
        yield { kind: "text", text: delta.text };
      } else if (delta.type === "input_json_delta") {
        const idx = parsed.index as number;
        const block = openBlocks.get(idx);
        if (block) {
          yield { kind: "tool_call_args", id: block.id, args_delta: delta.partial_json };
        }
      }
      return;
    }

    if (type === "content_block_stop") {
      const idx = parsed.index as number;
      const block = openBlocks.get(idx);
      if (block) {
        yield { kind: "tool_call_end", id: block.id };
        openBlocks.delete(idx);
      }
      return;
    }

    if (type === "message_delta") {
      const usage = parsed.usage;
      if (usage) {
        totalUsage.output = usage.output_tokens ?? 0;
      }
      return;
    }

    // message_stop — handled in the main loop (yield usage + done after stream ends)
  }
}
