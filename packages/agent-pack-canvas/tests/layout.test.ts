import { describe, it, expect } from "vitest";
import { CanvasStore } from "../src/store.js";
import { autoLayout, narrativeLayout } from "../src/layout.js";

const card = (id: string, batchId?: string) => ({
  id,
  refId: id,
  type: "image" as const,
  x: 0,
  y: 0,
  w: 320,
  h: 200,
  batchId,
});

describe("layout", () => {
  it("autoLayout groups same-batch contiguously", () => {
    const s = new CanvasStore();
    s.add(card("a", "b1"));
    s.add(card("b", "b2"));
    s.add(card("c", "b1"));
    autoLayout(s);
    // "a" gets slot 0, "b" gets slot 1, "c" gets slot 2 (b1 group continues)
    // Wait — map iteration order: b1 first (a,c), then b2 (b)
    // So: a=0,0  c=344,0  b=688,0
    expect(s.get("a")!.x).toBe(0);
    expect(s.get("c")!.x).toBe(320 + 24);
  });

  it("narrativeLayout puts each batch on its own row", () => {
    const s = new CanvasStore();
    s.add(card("a", "b1"));
    s.add(card("b", "b1"));
    s.add(card("c", "b2"));
    narrativeLayout(s);
    expect(s.get("a")!.y).toBe(s.get("b")!.y);
    expect(s.get("c")!.y).toBeGreaterThan(s.get("a")!.y);
  });

  it("autoLayout wraps to next row after cols cards", () => {
    const s = new CanvasStore();
    for (let i = 0; i < 5; i++) {
      s.add(card(`c${i}`));
    }
    autoLayout(s, 4);
    // Card index 4 should be on row 1 (y = CARD_H + GAP = 224)
    expect(s.get("c4")!.y).toBe(200 + 24);
    expect(s.get("c4")!.x).toBe(0);
  });

  it("narrativeLayout places batch cards horizontally", () => {
    const s = new CanvasStore();
    s.add(card("a", "b1"));
    s.add(card("b", "b1"));
    s.add(card("c", "b1"));
    narrativeLayout(s);
    expect(s.get("a")!.x).toBe(0);
    expect(s.get("b")!.x).toBe(320 + 24);
    expect(s.get("c")!.x).toBe((320 + 24) * 2);
    // All on row 0
    expect(s.get("a")!.y).toBe(0);
    expect(s.get("b")!.y).toBe(0);
    expect(s.get("c")!.y).toBe(0);
  });
});
