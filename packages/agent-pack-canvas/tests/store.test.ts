import { describe, it, expect } from "vitest";
import { CanvasStore } from "../src/store.js";

const makeCard = (id: string, batchId?: string) => ({
  id,
  refId: id,
  type: "image" as const,
  x: 0,
  y: 0,
  w: 320,
  h: 200,
  batchId,
});

describe("CanvasStore", () => {
  it("add and get round-trips", () => {
    const s = new CanvasStore();
    const card = makeCard("c1");
    s.add(card);
    expect(s.get("c1")).toEqual(card);
  });

  it("getByRefId finds a card by refId", () => {
    const s = new CanvasStore();
    s.add(makeCard("c1", "b1"));
    expect(s.getByRefId("c1")).toBeDefined();
    expect(s.getByRefId("nonexistent")).toBeUndefined();
  });

  it("remove deletes the card and returns true", () => {
    const s = new CanvasStore();
    s.add(makeCard("c1"));
    expect(s.remove("c1")).toBe(true);
    expect(s.get("c1")).toBeUndefined();
  });

  it("remove returns false for nonexistent card", () => {
    const s = new CanvasStore();
    expect(s.remove("ghost")).toBe(false);
  });

  it("byBatch filters cards by batchId", () => {
    const s = new CanvasStore();
    s.add(makeCard("a", "b1"));
    s.add(makeCard("b", "b1"));
    s.add(makeCard("c", "b2"));
    expect(s.byBatch("b1")).toHaveLength(2);
    expect(s.byBatch("b2")).toHaveLength(1);
    expect(s.byBatch("b3")).toHaveLength(0);
  });

  it("update patches a card field", () => {
    const s = new CanvasStore();
    s.add(makeCard("c1"));
    s.update("c1", { url: "https://example.com/img.png", x: 100 });
    const card = s.get("c1")!;
    expect(card.url).toBe("https://example.com/img.png");
    expect(card.x).toBe(100);
    expect(card.id).toBe("c1"); // id preserved
  });

  it("update throws on unknown card", () => {
    const s = new CanvasStore();
    expect(() => s.update("ghost", { x: 10 })).toThrow("Unknown card: ghost");
  });
});
