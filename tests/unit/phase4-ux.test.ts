import { describe, it, expect, beforeEach } from "vitest";
import { canvasGetTool, canvasRemoveTool } from "@/lib/tools/canvas-tools";
import { useCanvasStore } from "@/lib/canvas/store";
import { getCompactionStats } from "@/lib/agents/claude/compaction";
import { compactHistory } from "@/lib/agents/claude/compaction";

describe("Phase 4: Canvas Awareness", () => {
  beforeEach(() => {
    const state = useCanvasStore.getState();
    // Clear all cards
    state.cards.forEach((c) => state.removeCard(c.id));
  });

  it("canvas_get returns compact summaries with has_media field", async () => {
    useCanvasStore.getState().addCard({ type: "image", title: "Dragon", url: "https://example.com/img.png" });
    useCanvasStore.getState().addCard({ type: "video", title: "Flying" });

    const result = await canvasGetTool.execute({});
    expect(result.success).toBe(true);
    expect(result.data.total).toBe(2);
    expect(result.data.cards).toHaveLength(2);
    expect(result.data.cards[0].has_media).toBe(true);
    expect(result.data.cards[1].has_media).toBe(false);
    // Should NOT include full url or id (compact format)
    expect(result.data.cards[0].url).toBeUndefined();
  });

  it("canvas_get supports filter_type", async () => {
    useCanvasStore.getState().addCard({ type: "image", title: "Img1" });
    useCanvasStore.getState().addCard({ type: "video", title: "Vid1" });
    useCanvasStore.getState().addCard({ type: "image", title: "Img2" });

    const result = await canvasGetTool.execute({ filter_type: "video" });
    expect(result.success).toBe(true);
    expect(result.data.cards).toHaveLength(1);
    expect(result.data.cards[0].title).toBe("Vid1");
    expect(result.data.total).toBe(3); // total is unfiltered
  });

  it("canvas_remove removes by filter_type", async () => {
    useCanvasStore.getState().addCard({ type: "video", title: "Vid1" });
    useCanvasStore.getState().addCard({ type: "video", title: "Vid2" });
    useCanvasStore.getState().addCard({ type: "image", title: "Img1" });

    const result = await canvasRemoveTool.execute({ filter_type: "video" });
    expect(result.success).toBe(true);
    expect(result.data.count).toBe(2);
    expect(useCanvasStore.getState().cards).toHaveLength(1);
    expect(useCanvasStore.getState().cards[0].title).toBe("Img1");
  });

  it("canvas_remove removes by ref_id", async () => {
    const card = useCanvasStore.getState().addCard({ type: "image", title: "Target", refId: "target_1" });
    useCanvasStore.getState().addCard({ type: "image", title: "Keep" });

    const result = await canvasRemoveTool.execute({ ref_id: "target_1" });
    expect(result.success).toBe(true);
    expect(result.data.count).toBe(1);
    expect(useCanvasStore.getState().cards).toHaveLength(1);
  });

  it("canvas_remove errors without params", async () => {
    const result = await canvasRemoveTool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain("ref_id or filter_type");
  });
});

describe("Phase 4: Tool Pills Schema", () => {
  it("canvas_get has filter_type in schema", () => {
    expect(canvasGetTool.parameters.properties?.filter_type?.enum).toContain("image");
    expect(canvasGetTool.parameters.properties?.filter_type?.enum).toContain("video");
  });

  it("canvas_remove has correct schema", () => {
    expect(canvasRemoveTool.name).toBe("canvas_remove");
    expect(canvasRemoveTool.parameters.properties?.ref_id).toBeDefined();
    expect(canvasRemoveTool.parameters.properties?.filter_type).toBeDefined();
  });
});

describe("Phase 4: Compaction Stats", () => {
  it("getCompactionStats returns estimated_tokens_saved", () => {
    const stats = getCompactionStats();
    expect(stats).toHaveProperty("estimated_tokens_saved");
    expect(stats).toHaveProperty("total_chars_saved");
    expect(stats).toHaveProperty("compaction_count");
    expect(typeof stats.estimated_tokens_saved).toBe("number");
  });

  it("compaction tracks savings across calls", () => {
    // Create messages with a large tool result that will be compacted
    const longResult = JSON.stringify({ image_url: "https://example.com/" + "a".repeat(200) });
    const msgs = [
      {
        role: "user" as const,
        content: [{ type: "tool_result", tool_use_id: "t1", content: longResult }],
      },
      ...Array.from({ length: 7 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `msg ${i}`,
      })),
    ];

    const compacted = compactHistory(msgs, 4);
    const block = (compacted[0].content as Array<{ content: string }>)[0];
    // Should be compacted to a short summary
    expect(block.content).toContain("[image:");
    expect(block.content.length).toBeLessThan(longResult.length);
  });
});
