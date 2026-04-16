/**
 * MockProvider — used in unit tests for every other subsystem.
 * Replays a scripted sequence of chunks.
 */

import type { LLMProvider, LLMRequest, LLMChunk } from "./types.js";
import type { Tier } from "../types.js";

export interface MockScript {
  responses: LLMChunk[][];
  tiers?: Tier[];
}

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly tiers: Tier[];
  readonly received: LLMRequest[] = [];

  private callIndex = 0;
  private script: MockScript;

  constructor(script: MockScript) {
    this.script = script;
    this.tiers = script.tiers ?? [0, 1, 2, 3];
  }

  async *call(req: LLMRequest, _signal?: AbortSignal): AsyncIterable<LLMChunk> {
    this.received.push(req);
    const chunks = this.script.responses[this.callIndex] ?? [];
    this.callIndex++;
    for (const c of chunks) {
      yield c;
    }
    if (chunks[chunks.length - 1]?.kind !== "done") {
      yield { kind: "done" };
    }
  }

  get callCount(): number {
    return this.callIndex;
  }

  reset(): void {
    this.received.length = 0;
    this.callIndex = 0;
  }
}
