/**
 * Gemini provider plugin. Translates portable LLMRequest into the
 * Gemini REST API format and streams the response back as LLMChunks.
 *
 * Models served:
 *   Tier 0: gemini-2.5-flash-lite
 *   Tier 1: gemini-2.5-flash (default)
 *   Tier 2: gemini-2.5-pro
 *   Tier 3: gemini-2.5-pro
 *
 * [INV-9]: this file is the ONLY place gemini-specific code lives.
 */

import type { LLMProvider, LLMRequest, LLMChunk, ToolSchema } from "./types.js";
import type { Tier, TokenUsage } from "../types.js";

export interface GeminiConfig {
  apiKey: string;
  /** Override the API endpoint for testing. */
  endpoint?: string;
  /** Per-tier model override. */
  models?: Partial<Record<Tier, string>>;
}

const DEFAULT_MODELS: Record<Tier, string> = {
  0: "gemini-2.5-flash-lite",
  1: "gemini-2.5-flash",
  2: "gemini-2.5-pro",
  3: "gemini-2.5-pro",
};

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  constructor(private config: GeminiConfig) {}

  async *call(req: LLMRequest, signal?: AbortSignal): AsyncIterable<LLMChunk> {
    const model = this.config.models?.[req.tier] ?? DEFAULT_MODELS[req.tier];
    const endpoint =
      this.config.endpoint ??
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent`;
    const url = `${endpoint}?key=${this.config.apiKey}&alt=sse`;

    const body = this.buildBody(req);

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      yield { kind: "error", error: `Gemini ${resp.status}: ${errText.slice(0, 200)}` };
      return;
    }

    if (!resp.body) {
      yield { kind: "error", error: "Gemini returned no body" };
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalUsage: TokenUsage | undefined;

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
          for (const chunk of this.parseChunk(parsed)) {
            yield chunk;
          }
          if (parsed.usageMetadata) {
            totalUsage = {
              input: parsed.usageMetadata.promptTokenCount ?? 0,
              output: parsed.usageMetadata.candidatesTokenCount ?? 0,
              cached: parsed.usageMetadata.cachedContentTokenCount ?? 0,
            };
          }
        } catch {
          /* skip malformed chunks */
        }
      }
    }

    if (totalUsage) yield { kind: "usage", usage: totalUsage };
    yield { kind: "done" };
  }

  private buildBody(req: LLMRequest): unknown {
    // Translate Message[] into Gemini's contents[] format
    const contents = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : m.role === "tool" ? "function" : "user",
        parts: m.tool_calls
          ? m.tool_calls.map((tc) => ({
              functionCall: { name: tc.name, args: tc.args },
            }))
          : m.role === "tool"
            ? [{ functionResponse: { name: m.tool_name ?? "", response: { content: m.content } } }]
            : [{ text: m.content }],
      }));

    const systemInstruction = req.messages.find((m) => m.role === "system")?.content;

    return {
      contents,
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      ...(req.tools.length > 0
        ? { tools: [{ functionDeclarations: req.tools.map((t) => this.toolToFunction(t)) }] }
        : {}),
      generationConfig: {
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.max_tokens !== undefined ? { maxOutputTokens: req.max_tokens } : {}),
      },
    };
  }

  private toolToFunction(t: ToolSchema): unknown {
    return {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    };
  }

  private *parseChunk(parsed: any): Iterable<LLMChunk> {
    const candidates = parsed.candidates ?? [];
    for (const c of candidates) {
      const parts = c.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text === "string" && part.text.length > 0) {
          yield { kind: "text", text: part.text };
        }
        if (part.functionCall) {
          const id = `call_${Math.random().toString(36).slice(2, 10)}`;
          yield { kind: "tool_call_start", id, name: part.functionCall.name };
          yield { kind: "tool_call_args", id, args_delta: JSON.stringify(part.functionCall.args ?? {}) };
          yield { kind: "tool_call_end", id };
        }
      }
    }
  }
}
