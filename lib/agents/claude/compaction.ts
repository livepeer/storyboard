/**
 * Conversation compaction — shrink old tool results to save tokens.
 *
 * After Claude processes a tool result and moves on, the full result
 * (URLs, metadata, JSON) is no longer needed for reasoning. Compact it
 * to a short summary to reduce accumulated token cost.
 */

const COMPACTION_STATS_KEY = "storyboard_compaction_stats";

interface CompactionStats {
  total_chars_saved: number;
  compaction_count: number;
}

function loadStats(): CompactionStats {
  if (typeof window === "undefined") return { total_chars_saved: 0, compaction_count: 0 };
  try {
    const raw = localStorage.getItem(COMPACTION_STATS_KEY);
    return raw ? JSON.parse(raw) : { total_chars_saved: 0, compaction_count: 0 };
  } catch {
    return { total_chars_saved: 0, compaction_count: 0 };
  }
}

function saveStats(stats: CompactionStats) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COMPACTION_STATS_KEY, JSON.stringify(stats));
}

export function getCompactionStats(): CompactionStats & { estimated_tokens_saved: number } {
  const stats = loadStats();
  return {
    ...stats,
    // Rough estimate: ~4 chars per token
    estimated_tokens_saved: Math.round(stats.total_chars_saved / 4),
  };
}

function trackSaving(charsBefore: number, charsAfter: number) {
  if (charsAfter >= charsBefore) return;
  const stats = loadStats();
  stats.total_chars_saved += charsBefore - charsAfter;
  stats.compaction_count += 1;
  saveStats(stats);
}

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

  const beforeLen = JSON.stringify(messages).length;
  const result = messages.map((msg, i) => {
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

  const afterLen = JSON.stringify(result).length;
  trackSaving(beforeLen, afterLen);
  return result;
}
