import { MockProvider, type MockScript } from "../../src/providers/mock.js";
import type { LLMChunk } from "../../src/providers/types.js";

export function textResponse(text: string): LLMChunk[] {
  return [
    { kind: "text", text },
    { kind: "usage", usage: { input: 100, output: Math.ceil(text.length / 4) } },
    { kind: "done" },
  ];
}

export function toolCallResponse(
  callId: string,
  name: string,
  args: Record<string, unknown>,
): LLMChunk[] {
  return [
    { kind: "tool_call_start", id: callId, name },
    { kind: "tool_call_args", id: callId, args_delta: JSON.stringify(args) },
    { kind: "tool_call_end", id: callId },
    { kind: "usage", usage: { input: 200, output: 50 } },
    { kind: "done" },
  ];
}

export function makeMock(...responses: LLMChunk[][]): MockProvider {
  return new MockProvider({ responses } satisfies MockScript);
}
