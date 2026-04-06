/**
 * Conversation compaction — shrink old tool results to save tokens.
 *
 * After Claude processes a tool result and moves on, the full result
 * (URLs, metadata, JSON) is no longer needed for reasoning. Compact it
 * to a short summary to reduce accumulated token cost.
 */

function compactToolResult(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (parsed.error) return `[error: ${String(parsed.error).slice(0, 60)}]`;
    if (parsed.image_url) return `[image: ...${String(parsed.image_url).slice(-20)}]`;
    if (parsed.video_url) return `[video: ...${String(parsed.video_url).slice(-20)}]`;
    if (parsed.audio_url) return `[audio: ...${String(parsed.audio_url).slice(-20)}]`;
    if (parsed.cards_created) return `[created ${parsed.cards_created.length} cards]`;
    if (parsed.data?.cards_created) return `[created ${parsed.data.cards_created.length} cards]`;
    if (Array.isArray(parsed)) return `[${parsed.length} items]`;
    if (parsed.data?.content) return `[skill loaded: ${String(parsed.data.skill_id)}]`;
    if (parsed.success !== undefined) return `[${parsed.success ? "ok" : "failed"}]`;
    return `[result: ${JSON.stringify(parsed).slice(0, 60)}...]`;
  } catch {
    return `[${content.slice(0, 60)}...]`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMessage = { role: string; content: any };

/**
 * Compact conversation history. Keeps the most recent N messages intact,
 * compacts tool results in older messages.
 */
export function compactHistory<T extends AnyMessage>(
  messages: T[],
  keepRecent = 6
): T[] {
  if (messages.length <= keepRecent) return messages;

  return messages.map((msg, i) => {
    if (i >= messages.length - keepRecent) return msg;

    if (msg.role === "user" && Array.isArray(msg.content)) {
      const compacted = (msg.content as Array<Record<string, unknown>>).map(
        (block) => {
          if (
            block.type === "tool_result" &&
            typeof block.content === "string"
          ) {
            return { ...block, content: compactToolResult(block.content) };
          }
          return block;
        }
      );
      return { ...msg, content: compacted } as T;
    }

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const compacted = (msg.content as Array<Record<string, unknown>>).map(
        (block) => {
          if (
            block.type === "text" &&
            typeof block.text === "string" &&
            (block.text as string).length > 200
          ) {
            return { ...block, text: (block.text as string).slice(0, 200) + "..." };
          }
          return block;
        }
      );
      return { ...msg, content: compacted } as T;
    }

    return msg;
  });
}
