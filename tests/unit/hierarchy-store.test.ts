import { describe, it, expect, beforeEach } from "vitest";
import { computeBoundingBox, isPointInBox } from "@/lib/episodes/bounding-box";

describe("computeBoundingBox", () => {
  const card = (x: number, y: number, w = 320, h = 280) =>
    ({ id: `c${x}`, refId: `r${x}`, x, y, w, h } as any);

  it("returns null for empty cards", () => {
    expect(computeBoundingBox([], 20, 32)).toBeNull();
  });

  it("computes box around single card", () => {
    const box = computeBoundingBox([card(100, 200)], 20, 32);
    expect(box).toEqual({
      x: 80, // 100 - 20
      y: 148, // 200 - 32 - 20
      w: 360, // 320 + 40
      h: 352, // 280 + 32 + 2*20
    });
  });

  it("computes box around multiple cards", () => {
    const box = computeBoundingBox([card(0, 0), card(400, 0)], 20, 32);
    expect(box!.x).toBe(-20);
    expect(box!.w).toBe(400 + 320 + 40); // span + padding*2
  });
});

describe("isPointInBox", () => {
  it("detects point inside", () => {
    expect(isPointInBox(50, 50, { x: 0, y: 0, w: 100, h: 100 })).toBe(true);
  });

  it("detects point outside", () => {
    expect(isPointInBox(150, 50, { x: 0, y: 0, w: 100, h: 100 })).toBe(false);
  });

  it("detects point on edge as inside", () => {
    expect(isPointInBox(100, 100, { x: 0, y: 0, w: 100, h: 100 })).toBe(true);
  });
});
