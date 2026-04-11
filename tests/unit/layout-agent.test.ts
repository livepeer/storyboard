import { describe, it, expect } from "vitest";
import { pickStrategy, prePlan } from "@/lib/layout/agent";
import type { LayoutContext } from "@/lib/layout/types";

function makeCard(id: string, refId: string, batchId?: string) {
  return { id, refId, type: "image" as const, title: `Card ${id}`, x: 0, y: 0, w: 320, h: 280, minimized: false, batchId };
}

describe("pickStrategy", () => {
  it("returns user preference when set", () => {
    const ctx: LayoutContext = { cards: [], edges: [], episodes: [], activeEpisodeId: null, canvasWidth: 1920 };
    expect(pickStrategy(ctx, "graphic-novel")).toBe("graphic-novel");
  });

  it("returns episode when active episode + multiple episodes", () => {
    const ctx: LayoutContext = {
      cards: [], edges: [],
      episodes: [
        { id: "e1", name: "A", cardIds: [], context: {}, color: "#f00", createdAt: 0 },
        { id: "e2", name: "B", cardIds: [], context: {}, color: "#0f0", createdAt: 0 },
      ],
      activeEpisodeId: "e1", canvasWidth: 1920,
    };
    expect(pickStrategy(ctx, null)).toBe("episode");
  });

  it("returns narrative when many edges", () => {
    const cards = Array.from({ length: 5 }, (_, i) => makeCard(String(i), `img-${i}`));
    const edges = [
      { fromRefId: "img-0", toRefId: "img-1" }, { fromRefId: "img-1", toRefId: "img-2" },
      { fromRefId: "img-2", toRefId: "img-3" }, { fromRefId: "img-3", toRefId: "img-4" },
    ];
    const ctx: LayoutContext = { cards, edges, episodes: [], activeEpisodeId: null, canvasWidth: 1920 };
    expect(pickStrategy(ctx, null)).toBe("narrative");
  });

  it("returns basic by default", () => {
    const ctx: LayoutContext = { cards: [], edges: [], episodes: [], activeEpisodeId: null, canvasWidth: 1920 };
    expect(pickStrategy(ctx, null)).toBe("basic");
  });
});

describe("prePlan", () => {
  it("returns positions for N new cards", () => {
    const existing = [makeCard("0", "img-1"), makeCard("1", "img-2")];
    const positions = prePlan(existing, 3, "basic");
    expect(positions).toHaveLength(3);
    // All positions should have valid x, y, w, h
    for (const pos of positions) {
      expect(pos.x).toBeGreaterThanOrEqual(0);
      expect(pos.y).toBeGreaterThan(0);
      expect(pos.w).toBe(320);
      expect(pos.h).toBe(280);
    }
  });

  it("returns empty for 0 new cards", () => {
    expect(prePlan([], 0, "basic")).toEqual([]);
  });

  it("new cards start below existing cards", () => {
    const existing = [{ ...makeCard("0", "img-1"), x: 24, y: 72, w: 320, h: 280 }];
    const positions = prePlan(existing, 2, "basic");
    // New cards should be below existing (y > existing bottom)
    expect(positions[0].y).toBeGreaterThanOrEqual(existing[0].y + existing[0].h);
  });
});
