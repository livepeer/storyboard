/**
 * The single LLMProvider interface every provider plugin implements.
 *
 * [INV-9]: the agent runner has zero provider-specific code.
 */

import type { Message, Tier, TokenUsage } from "../types.js";

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMRequest {
  messages: Message[];
  tools: ToolSchema[];
  tier: Tier;
  temperature?: number;
  max_tokens?: number;
  /**
   * The first N messages that should be marked as cacheable on
   * providers that support prompt caching ([Q3a-AllLayers] Layer 2).
   */
  cacheable_prefix_count?: number;
}

export type LLMChunk =
  | { kind: "text"; text: string }
  | { kind: "tool_call_start"; id: string; name: string }
  | { kind: "tool_call_args"; id: string; args_delta: string }
  | { kind: "tool_call_end"; id: string }
  | { kind: "usage"; usage: TokenUsage }
  | { kind: "done" }
  | { kind: "error"; error: string };

export interface LLMProvider {
  readonly name: string;
  readonly tiers: Tier[];
  call(req: LLMRequest, signal?: AbortSignal): AsyncIterable<LLMChunk>;
}
