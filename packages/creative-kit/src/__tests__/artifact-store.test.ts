import { describe, it, expect, beforeEach } from "vitest";
import { createArtifactStore } from "../stores/create-artifact-store";

// Each test gets a fresh store instance
function makeStore() {
  return createArtifactStore({ cols: 5, cardW: 320, cardH: 280, gap: 24 });
}

describe("createArtifactStore", () => {
  describe("initial state", () => {
    it("starts empty", () => {
      const store = makeStore();
      const s = store.getState();
      expect(s.artifacts).toHaveLength(0);
      expect(s.edges).toHaveLength(0);
      expect(s.selectedIds).toHaveLength(0);
      expect(s.viewport).toEqual({ x: 0, y: 0, scale: 1 });
    });
  });

  describe("add()", () => {
    it("creates artifact with auto-generated id and position", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "First" });
      expect(a.id).toBeTruthy();
      expect(a.refId).toMatch(/^image-/);
      expect(a.type).toBe("image");
      expect(a.title).toBe("First");
      expect(typeof a.x).toBe("number");
      expect(typeof a.y).toBe("number");
      expect(a.w).toBe(320);
      expect(a.h).toBe(280);
      expect(store.getState().artifacts).toHaveLength(1);
    });

    it("positions cards in a 5-column grid", () => {
      const store = makeStore();
      const cards = Array.from({ length: 7 }, (_, i) =>
        store.getState().add({ type: "image", title: `Card ${i}` }),
      );
      // Col positions for first row (cols 0-4): x = col * (320 + 24)
      expect(cards[0].x).toBe(0);
      expect(cards[0].y).toBe(0);
      expect(cards[1].x).toBe(344); // 1 * 344
      expect(cards[5].x).toBe(0);   // wraps to col 0
      expect(cards[5].y).toBe(304); // 1 * (280 + 24) = 304
      expect(cards[6].x).toBe(344); // col 1, row 1
    });

    it("respects explicit x/y/w/h", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "video", title: "V", x: 100, y: 200, w: 400, h: 300 });
      expect(a.x).toBe(100);
      expect(a.y).toBe(200);
      expect(a.w).toBe(400);
      expect(a.h).toBe(300);
    });

    it("respects explicit id and refId", () => {
      const store = makeStore();
      const a = store.getState().add({ id: "my-id", refId: "my-ref", type: "image", title: "T" });
      expect(a.id).toBe("my-id");
      expect(a.refId).toBe("my-ref");
    });

    it("stores artifact in state", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "Stored" });
      expect(store.getState().artifacts[0]).toEqual(a);
    });
  });

  describe("update()", () => {
    it("patches artifact by id", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "Old" });
      store.getState().update(a.id, { title: "New", url: "https://example.com/img.png" });
      const updated = store.getState().getById(a.id);
      expect(updated?.title).toBe("New");
      expect(updated?.url).toBe("https://example.com/img.png");
    });

    it("leaves other artifacts unchanged", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A1" });
      const a2 = store.getState().add({ type: "image", title: "A2" });
      store.getState().update(a1.id, { title: "Updated A1" });
      expect(store.getState().getById(a2.id)?.title).toBe("A2");
    });

    it("is a no-op for unknown id", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "T" });
      store.getState().update("nonexistent", { title: "ghost" });
      expect(store.getState().artifacts).toHaveLength(1);
      expect(store.getState().getById(a.id)?.title).toBe("T");
    });
  });

  describe("remove()", () => {
    it("deletes artifact by id", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "Del" });
      store.getState().remove(a.id);
      expect(store.getState().artifacts).toHaveLength(0);
      expect(store.getState().getById(a.id)).toBeUndefined();
    });

    it("cleans up edges referencing the removed artifact", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A" });
      const a2 = store.getState().add({ type: "image", title: "B" });
      const a3 = store.getState().add({ type: "image", title: "C" });
      store.getState().connect(a1.refId, a2.refId);
      store.getState().connect(a2.refId, a3.refId);
      store.getState().connect(a1.refId, a3.refId);
      expect(store.getState().edges).toHaveLength(3);
      store.getState().remove(a2.id);
      // Edges involving a2's refId should be gone
      const edges = store.getState().edges;
      expect(edges).toHaveLength(1);
      expect(edges[0].fromRefId).toBe(a1.refId);
      expect(edges[0].toRefId).toBe(a3.refId);
    });

    it("removes id from selectedIds", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "Sel" });
      store.getState().select([a.id]);
      store.getState().remove(a.id);
      expect(store.getState().selectedIds).not.toContain(a.id);
    });

    it("is a no-op for unknown id", () => {
      const store = makeStore();
      store.getState().add({ type: "image", title: "T" });
      store.getState().remove("nope");
      expect(store.getState().artifacts).toHaveLength(1);
    });
  });

  describe("getById() / getByRefId()", () => {
    it("getByRefId finds artifact by refId", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "video", title: "V" });
      const found = store.getState().getByRefId(a.refId);
      expect(found).toEqual(a);
    });

    it("getByRefId returns undefined for unknown refId", () => {
      const store = makeStore();
      expect(store.getState().getByRefId("nope")).toBeUndefined();
    });

    it("getById returns undefined for unknown id", () => {
      const store = makeStore();
      expect(store.getState().getById("nope")).toBeUndefined();
    });
  });

  describe("connect() / disconnect()", () => {
    it("creates an edge between two artifacts", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A" });
      const a2 = store.getState().add({ type: "image", title: "B" });
      store.getState().connect(a1.refId, a2.refId);
      const edges = store.getState().edges;
      expect(edges).toHaveLength(1);
      expect(edges[0].fromRefId).toBe(a1.refId);
      expect(edges[0].toRefId).toBe(a2.refId);
    });

    it("creates edge with metadata", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A" });
      const a2 = store.getState().add({ type: "image", title: "B" });
      store.getState().connect(a1.refId, a2.refId, { label: "derived" });
      expect(store.getState().edges[0].metadata?.label).toBe("derived");
    });

    it("does not create duplicate edges", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A" });
      const a2 = store.getState().add({ type: "image", title: "B" });
      store.getState().connect(a1.refId, a2.refId);
      store.getState().connect(a1.refId, a2.refId);
      expect(store.getState().edges).toHaveLength(1);
    });

    it("disconnect removes the edge", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A" });
      const a2 = store.getState().add({ type: "image", title: "B" });
      store.getState().connect(a1.refId, a2.refId);
      store.getState().disconnect(a1.refId, a2.refId);
      expect(store.getState().edges).toHaveLength(0);
    });

    it("disconnect is a no-op for non-existent edge", () => {
      const store = makeStore();
      store.getState().disconnect("x", "y"); // no throw
      expect(store.getState().edges).toHaveLength(0);
    });
  });

  describe("select() and clearSelection()", () => {
    it("select sets selectedIds", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A" });
      const a2 = store.getState().add({ type: "image", title: "B" });
      store.getState().select([a1.id, a2.id]);
      expect(store.getState().selectedIds).toEqual([a1.id, a2.id]);
    });

    it("clearSelection empties selectedIds", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "A" });
      store.getState().select([a.id]);
      store.getState().clearSelection();
      expect(store.getState().selectedIds).toHaveLength(0);
    });

    it("select replaces previous selection", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A" });
      const a2 = store.getState().add({ type: "image", title: "B" });
      store.getState().select([a1.id]);
      store.getState().select([a2.id]);
      expect(store.getState().selectedIds).toEqual([a2.id]);
    });
  });

  describe("setViewport() and zoomTo()", () => {
    it("setViewport patches viewport", () => {
      const store = makeStore();
      store.getState().setViewport({ x: 100, y: 200 });
      expect(store.getState().viewport).toEqual({ x: 100, y: 200, scale: 1 });
    });

    it("setViewport is a partial update", () => {
      const store = makeStore();
      store.getState().setViewport({ scale: 2 });
      expect(store.getState().viewport.x).toBe(0);
      expect(store.getState().viewport.scale).toBe(2);
    });

    it("zoomTo sets scale", () => {
      const store = makeStore();
      store.getState().zoomTo(1.5);
      expect(store.getState().viewport.scale).toBe(1.5);
    });

    it("zoomTo with centerX/centerY updates position", () => {
      const store = makeStore();
      store.getState().zoomTo(2, 400, 300);
      expect(store.getState().viewport).toEqual({ x: 400, y: 300, scale: 2 });
    });

    it("zoomTo without center preserves current position", () => {
      const store = makeStore();
      store.getState().setViewport({ x: 50, y: 75 });
      store.getState().zoomTo(3);
      expect(store.getState().viewport.x).toBe(50);
      expect(store.getState().viewport.y).toBe(75);
    });
  });

  describe("applyLayout()", () => {
    it("repositions artifacts by id", () => {
      const store = makeStore();
      const a1 = store.getState().add({ type: "image", title: "A" });
      const a2 = store.getState().add({ type: "image", title: "B" });
      store.getState().applyLayout([
        { id: a1.id, x: 0, y: 0 },
        { id: a2.id, x: 500, y: 200 },
      ]);
      expect(store.getState().getById(a1.id)?.x).toBe(0);
      expect(store.getState().getById(a1.id)?.y).toBe(0);
      expect(store.getState().getById(a2.id)?.x).toBe(500);
      expect(store.getState().getById(a2.id)?.y).toBe(200);
    });

    it("also updates w/h when provided", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "A" });
      store.getState().applyLayout([{ id: a.id, x: 0, y: 0, w: 640, h: 480 }]);
      const updated = store.getState().getById(a.id);
      expect(updated?.w).toBe(640);
      expect(updated?.h).toBe(480);
    });

    it("preserves w/h when not specified", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "A" });
      store.getState().applyLayout([{ id: a.id, x: 10, y: 20 }]);
      expect(store.getState().getById(a.id)?.w).toBe(320);
    });

    it("ignores unknown ids", () => {
      const store = makeStore();
      const a = store.getState().add({ type: "image", title: "A" });
      const origX = store.getState().getById(a.id)!.x;
      store.getState().applyLayout([{ id: "ghost", x: 999, y: 999 }]);
      expect(store.getState().getById(a.id)?.x).toBe(origX);
    });
  });

  describe("maxArtifacts option", () => {
    it("caps the artifact array, removing oldest when exceeded", () => {
      const store = createArtifactStore({ maxArtifacts: 3 });
      const a1 = store.getState().add({ type: "image", title: "A1" });
      store.getState().add({ type: "image", title: "A2" });
      store.getState().add({ type: "image", title: "A3" });
      store.getState().add({ type: "image", title: "A4" });
      const ids = store.getState().artifacts.map((a) => a.id);
      expect(ids).toHaveLength(3);
      expect(ids).not.toContain(a1.id);
      expect(store.getState().artifacts.map((a) => a.title)).toEqual(["A2", "A3", "A4"]);
    });

    it("does not evict when under the cap", () => {
      const store = createArtifactStore({ maxArtifacts: 5 });
      for (let i = 0; i < 5; i++) {
        store.getState().add({ type: "image", title: `A${i}` });
      }
      expect(store.getState().artifacts).toHaveLength(5);
    });
  });
});
