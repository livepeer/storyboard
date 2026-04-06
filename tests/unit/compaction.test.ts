import { describe, it, expect } from "vitest";
import { compactHistory } from "@/lib/agents/claude/compaction";

describe("Conversation Compaction", () => {
  it("returns messages unchanged if fewer than keepRecent", () => {
    const msgs = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "hi" },
    ];
    expect(compactHistory(msgs, 6)).toEqual(msgs);
  });

  it("compacts tool results in old messages", () => {
    const msgs = [
      {
        role: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: "123",
            content: JSON.stringify({ image_url: "https://example.com/very/long/path/image.png" }),
          },
        ],
      },
      { role: "assistant" as const, content: [{ type: "text", text: "Done!" }] },
      { role: "user" as const, content: "thanks" },
      { role: "assistant" as const, content: "welcome" },
      { role: "user" as const, content: "create another" },
      { role: "assistant" as const, content: "ok" },
      { role: "user" as const, content: "latest" },
    ];

    const compacted = compactHistory(msgs, 4);
    // Old tool result should be compacted
    const oldMsg = compacted[0];
    expect(Array.isArray(oldMsg.content)).toBe(true);
    const block = (oldMsg.content as Array<{ content: string }>)[0];
    expect(block.content).toContain("[image:");
    expect(block.content).not.toContain("very/long/path");
  });

  it("keeps recent messages intact", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message ${i}`,
    }));

    const compacted = compactHistory(msgs, 4);
    // Last 4 should be unchanged
    expect(compacted[9]).toEqual(msgs[9]);
    expect(compacted[8]).toEqual(msgs[8]);
    expect(compacted[7]).toEqual(msgs[7]);
    expect(compacted[6]).toEqual(msgs[6]);
  });

  it("compacts long assistant text in old messages", () => {
    const longText = "A".repeat(500);
    const msgs = [
      { role: "assistant" as const, content: [{ type: "text", text: longText }] },
      ...Array.from({ length: 7 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `msg ${i}`,
      })),
    ];

    const compacted = compactHistory(msgs, 6);
    const oldBlock = (compacted[0].content as Array<{ text: string }>)[0];
    expect(oldBlock.text.length).toBeLessThan(250);
    expect(oldBlock.text).toContain("...");
  });

  it("handles error results in compaction", () => {
    const msgs = [
      {
        role: "user" as const,
        content: [
          {
            type: "tool_result",
            tool_use_id: "456",
            content: JSON.stringify({ error: "Model not found" }),
          },
        ],
      },
      ...Array.from({ length: 7 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `msg ${i}`,
      })),
    ];

    const compacted = compactHistory(msgs, 6);
    const block = (compacted[0].content as Array<{ content: string }>)[0];
    expect(block.content).toContain("[error:");
  });
});
