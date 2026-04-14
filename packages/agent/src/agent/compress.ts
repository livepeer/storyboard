/**
 * Layer 3 conversation hygiene: as conversation history grows, tool
 * results get progressively archived. Older results are replaced
 * with short reference markers so they don't bloat the context
 * window on every subsequent turn. The full result remains in
 * session memory and can be re-fetched via memory.show.
 */

import type { Message } from "../types.js";

const MAX_VERBATIM_TOOL_RESULTS = 3;
const MAX_ARCHIVED_RESULT_LENGTH = 80;

/**
 * Walk the message list and archive tool results older than the most
 * recent N. Mutates a copy and returns the new list.
 */
export function compressOldToolResults(messages: Message[]): Message[] {
  const out = [...messages];
  // Find indices of tool messages, keep last N verbatim
  const toolIndices: number[] = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i].role === "tool") toolIndices.push(i);
  }
  const archiveBefore = Math.max(0, toolIndices.length - MAX_VERBATIM_TOOL_RESULTS);
  for (let i = 0; i < archiveBefore; i++) {
    const idx = toolIndices[i];
    const original = out[idx];
    out[idx] = {
      ...original,
      content: archive(original.content, original.tool_call_id ?? ""),
    };
  }
  return out;
}

function archive(content: string, toolCallId: string): string {
  if (content.length <= MAX_ARCHIVED_RESULT_LENGTH) return content;
  return `[archived tool result, call_id=${toolCallId}, ${content.length} chars — fetch via memory.show]`;
}
