import { describe, it, expect, beforeEach } from "vitest";
import { createHistoryManager, type CanvasSnapshot } from "../stores/history-manager";

// Minimal localStorage polyfill for test environment
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  },
  writable: true,
});

function snap(label: string): CanvasSnapshot {
  return {
    cards: [{ id: label, refId: label, type: "image", title: label, x: 0, y: 0, w: 100, h: 100 }],
    edges: [],
  };
}

describe("HistoryManager", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("starts with no undo/redo", () => {
    const hm = createHistoryManager();
    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(false);
    expect(hm.undo()).toBeNull();
    expect(hm.redo()).toBeNull();
  });

  it("undo returns previous state", () => {
    const hm = createHistoryManager();
    const s1 = snap("s1");
    hm.pushUndo(s1);
    expect(hm.canUndo).toBe(true);
    const restored = hm.undo();
    expect(restored).toEqual(s1);
    expect(hm.canUndo).toBe(false);
  });

  it("redo works after undo", () => {
    const hm = createHistoryManager();
    const s1 = snap("s1");
    const s2 = snap("s2");
    hm.pushUndo(s1);
    hm.pushUndo(s2);

    // Undo twice
    const got2 = hm.undo();
    expect(got2).toEqual(s2);
    const got1 = hm.undo();
    expect(got1).toEqual(s1);

    expect(hm.canRedo).toBe(true);

    // Redo brings them back
    const redo1 = hm.redo();
    expect(redo1).toEqual(s1);
    const redo2 = hm.redo();
    expect(redo2).toEqual(s2);
    expect(hm.canRedo).toBe(false);
  });

  it("new push clears redo stack", () => {
    const hm = createHistoryManager();
    hm.pushUndo(snap("s1"));
    hm.pushUndo(snap("s2"));
    hm.undo(); // s2 goes to redo
    expect(hm.canRedo).toBe(true);

    hm.pushUndo(snap("s3")); // should clear redo
    expect(hm.canRedo).toBe(false);
    expect(hm.redo()).toBeNull();
  });

  it("respects max undo limit", () => {
    const hm = createHistoryManager({ maxUndo: 3 });
    hm.pushUndo(snap("a"));
    hm.pushUndo(snap("b"));
    hm.pushUndo(snap("c"));
    hm.pushUndo(snap("d")); // a should be evicted

    const d = hm.undo();
    const c = hm.undo();
    const b = hm.undo();
    const gone = hm.undo();

    expect(d!.cards[0].id).toBe("d");
    expect(c!.cards[0].id).toBe("c");
    expect(b!.cards[0].id).toBe("b");
    expect(gone).toBeNull(); // "a" was evicted
  });

  describe("named snapshots", () => {
    it("save and restore", () => {
      const hm = createHistoryManager();
      const s = snap("checkpoint");
      hm.saveSnapshot("v1", s, "thumb.png");

      const restored = hm.restoreSnapshot("v1");
      expect(restored).toEqual({ cards: s.cards, edges: s.edges });
    });

    it("list returns all snapshots", () => {
      const hm = createHistoryManager();
      hm.saveSnapshot("a", snap("a"));
      hm.saveSnapshot("b", snap("b"));

      const list = hm.listSnapshots();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe("a");
      expect(list[1].name).toBe("b");
      expect(list[0].timestamp).toBeGreaterThan(0);
    });

    it("remove deletes a snapshot", () => {
      const hm = createHistoryManager();
      hm.saveSnapshot("x", snap("x"));
      expect(hm.listSnapshots()).toHaveLength(1);

      hm.removeSnapshot("x");
      expect(hm.listSnapshots()).toHaveLength(0);
      expect(hm.restoreSnapshot("x")).toBeNull();
    });

    it("overwrites snapshot with same name", () => {
      const hm = createHistoryManager();
      hm.saveSnapshot("dup", snap("old"));
      hm.saveSnapshot("dup", snap("new"));

      const list = hm.listSnapshots();
      expect(list).toHaveLength(1);
      expect(list[0].cards[0].id).toBe("new");
    });

    it("respects max snapshots limit", () => {
      const hm = createHistoryManager({ maxSnapshots: 2 });
      hm.saveSnapshot("a", snap("a"));
      hm.saveSnapshot("b", snap("b"));
      hm.saveSnapshot("c", snap("c")); // a should be evicted

      const list = hm.listSnapshots();
      expect(list).toHaveLength(2);
      expect(list[0].name).toBe("b");
      expect(list[1].name).toBe("c");
    });
  });
});
