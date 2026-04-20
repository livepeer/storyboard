import { describe, it, expect } from "vitest";
import { runLayout } from "@/lib/layout/engine";
import { getBuiltInSkill } from "@/lib/layout/skills";
import type { LayoutContext } from "@/lib/layout/types";

function makeCard(id: string, refId: string, batchId?: string) {
  return { id, refId, type: "image" as const, title: `Card ${id}`, x: 0, y: 0, w: 320, h: 280, minimized: false, batchId };
}

function makeCtx(cards: ReturnType<typeof makeCard>[], edges: Array<{ id: string; fromRefId: string; toRefId: string }> = []): LayoutContext {
  return { cards, edges, episodes: [], activeEpisodeId: null, canvasWidth: 1920 };
}

describe("Layout Engine", () => {
  it("basic grid: 6 cards in one row", () => {
    const cards = Array.from({ length: 6 }, (_, i) => makeCard(String(i), `img-${i + 1}`));
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("basic")!);
    expect(pos).toHaveLength(6);
    const ys = new Set(pos.map((p) => p.y));
    expect(ys.size).toBe(1);
    for (let i = 1; i < pos.length; i++) {
      expect(pos[i].x).toBeGreaterThan(pos[i - 1].x);
    }
  });

  it("basic grid: 8 cards wraps to 2 rows", () => {
    const cards = Array.from({ length: 8 }, (_, i) => makeCard(String(i), `img-${i + 1}`));
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("basic")!);
    const ys = [...new Set(pos.map((p) => p.y))];
    expect(ys.length).toBe(2);
  });

  it("batch grouping keeps batches contiguous", () => {
    const cards = [
      makeCard("0", "img-1", "b1"), makeCard("1", "img-2", "b1"),
      makeCard("2", "img-3", "b2"), makeCard("3", "img-4", "b2"),
    ];
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("basic")!);
    expect(pos[0].x).toBeLessThan(pos[2].x);
  });

  it("narrative: each substantive batch (≥3 cards) gets its own row", () => {
    const cards = [
      makeCard("0", "img-1", "b1"), makeCard("1", "img-2", "b1"), makeCard("2", "img-3", "b1"),
      makeCard("3", "img-4", "b2"), makeCard("4", "img-5", "b2"), makeCard("5", "img-6", "b2"),
    ];
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("narrative")!);
    expect(pos[0].y).toBeLessThan(pos[3].y);
    expect(pos[0].y).toBe(pos[1].y);
    expect(pos[3].y).toBe(pos[5].y);
  });

  it("narrative: rowSeparator adds extra gap between substantive groups", () => {
    const cards = [
      makeCard("0", "img-1", "b1"), makeCard("1", "img-2", "b1"), makeCard("2", "img-3", "b1"),
      makeCard("3", "img-4", "b2"), makeCard("4", "img-5", "b2"), makeCard("5", "img-6", "b2"),
    ];
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("narrative")!);
    const yGap = pos[3].y - pos[0].y;
    expect(yGap).toBeGreaterThan(280 + 24);
  });

  // --- Regression tests for tiny-batch merge (Bug 2) ---
  // Each create_media call gets a fresh batchId, so iterative 1-card
  // clarifications would otherwise put every card on its own row.
  // groupByBatch now merges trailing batches < 3 cards.

  it("narrative: 5-card batch + five 1-card iterations → fewer than 6 rows", () => {
    const firstBatch = [
      makeCard("0", "img-1", "b1"), makeCard("1", "img-2", "b1"),
      makeCard("2", "img-3", "b1"), makeCard("3", "img-4", "b1"),
      makeCard("4", "img-5", "b1"),
    ];
    const iterations = Array.from({ length: 5 }, (_, i) =>
      makeCard(String(5 + i), `img-${6 + i}`, `b_iter_${i}`)
    );
    const pos = runLayout(makeCtx([...firstBatch, ...iterations]), getBuiltInSkill("narrative")!);
    const ys = new Set(pos.map((p) => p.y));
    expect(pos).toHaveLength(10);
    expect(ys.size).toBeLessThanOrEqual(2);
  });

  it("narrative: cards with no batchId merge into a single group", () => {
    const cards = Array.from({ length: 5 }, (_, i) => makeCard(String(i), `img-${i + 1}`));
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("narrative")!);
    const ys = new Set(pos.map((p) => p.y));
    expect(ys.size).toBe(1);
  });

  it("narrative: two 1-card batches produce one row (merged)", () => {
    const cards = [makeCard("0", "img-1", "b1"), makeCard("1", "img-2", "b2")];
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("narrative")!);
    expect(pos[0].y).toBe(pos[1].y);
  });

  it("no cards returns empty", () => {
    expect(runLayout(makeCtx([]), getBuiltInSkill("basic")!)).toEqual([]);
  });

  it("freeform returns current positions", () => {
    const cards = [{ ...makeCard("0", "img-1"), x: 100, y: 200 }, { ...makeCard("1", "img-2"), x: 500, y: 600 }];
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("freeform")!);
    expect(pos[0].x).toBe(100);
    expect(pos[1].x).toBe(500);
  });

  it("edge ordering respects direction", () => {
    const cards = [makeCard("0", "img-1"), makeCard("1", "img-2"), makeCard("2", "img-3")];
    const edges = [{ id: "e0", fromRefId: "img-3", toRefId: "img-1" }];
    const pos = runLayout(makeCtx(cards, edges), getBuiltInSkill("basic")!);
    const idx3 = pos.findIndex((p) => p.cardId === "2");
    const idx1 = pos.findIndex((p) => p.cardId === "0");
    expect(pos[idx3].x).toBeLessThanOrEqual(pos[idx1].x);
  });

  it("episode grouping", () => {
    const cards = [makeCard("0", "img-1"), makeCard("1", "img-2"), makeCard("2", "img-3"), makeCard("3", "img-4")];
    const episodes = [
      { id: "ep1", name: "A", cardIds: ["0", "1"], context: {}, color: "#f00", createdAt: 0 },
      { id: "ep2", name: "B", cardIds: ["2", "3"], context: {}, color: "#0f0", createdAt: 0 },
    ];
    const ctx: LayoutContext = { cards, edges: [], episodes, activeEpisodeId: null, canvasWidth: 1920 };
    const pos = runLayout(ctx, getBuiltInSkill("episode")!);
    expect(pos[0].y).toBeLessThan(pos[2].y);
  });

  it("cardScale changes dimensions", () => {
    const cards = [makeCard("0", "img-1")];
    const pos = runLayout(makeCtx(cards), getBuiltInSkill("graphic-novel")!);
    expect(pos[0].w).toBe(Math.round(320 * 1.3));
    expect(pos[0].h).toBe(Math.round(280 * 1.3));
  });

  it("custom layoutFn overrides preset", () => {
    const cards = [makeCard("0", "img-1"), makeCard("1", "img-2")];
    const skill = {
      id: "custom", name: "Custom", description: "", category: "user" as const,
      layoutFn: (ctx: LayoutContext) => ctx.cards.map((c, i) => ({ cardId: c.id, x: i * 999, y: i * 111 })),
    };
    const pos = runLayout(makeCtx(cards), skill);
    expect(pos[0].x).toBe(0);
    expect(pos[1].x).toBe(999);
  });
});
