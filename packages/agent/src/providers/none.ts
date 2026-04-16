import type { LLMProvider, LLMRequest, LLMChunk } from "./types.js";
import type { Tier } from "../types.js";

/**
 * None provider — refuses to call any LLM. Used for slash commands
 * and high-confidence preprocessor paths where calling an LLM would
 * be wasted tokens.
 */
export class NoneProvider implements LLMProvider {
  readonly name = "none";
  readonly tiers: Tier[] = [];
  async *call(_req: LLMRequest): AsyncIterable<LLMChunk> {
    yield { kind: "error", error: "NoneProvider refuses LLM calls — use a real provider" };
  }
}
