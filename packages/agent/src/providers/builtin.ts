import type { LLMProvider, LLMRequest, LLMChunk } from "./types.js";
import type { Tier } from "../types.js";

/**
 * Builtin provider — pattern-matches on the user message and emits a
 * canned LLMChunk stream. Used for SDK-internal reasoning tasks where
 * the response shape is deterministic (intent classification, scene
 * extraction, etc.). No LLM cost.
 */
export class BuiltinProvider implements LLMProvider {
  readonly name = "builtin";
  readonly tiers: Tier[] = [0];
  async *call(_req: LLMRequest): AsyncIterable<LLMChunk> {
    yield { kind: "text", text: "" };
    yield { kind: "usage", usage: { input: 0, output: 0 } };
    yield { kind: "done" };
  }
}
