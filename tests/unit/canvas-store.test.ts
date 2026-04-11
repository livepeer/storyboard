import { describe, it, expect, beforeEach } from "vitest";
import { useCanvasStore } from "@/lib/canvas/store";

function resetStore() {
  useCanvasStore.setState({
    viewport: { panX: 0, panY: 0, scale: 1 },
    cards: [],
    edges: [],
    selectedCardIds: new Set<string>(),
    selectedEdgeIdx: -1,
  });
}

describe("Canvas Store", () => {
  beforeEach(() => resetStore());

  describe("addCard", () => {
    it("creates a card with correct defaults", () => {
      const card = useCanvasStore.getState().addCard({
        type: "image",
        title: "Test Image",
      });

      expect(card.type).toBe("image");
      expect(card.title).toBe("Test Image");
      expect(card.w).toBe(320);
      expect(card.h).toBe(280);
      expect(card.minimized).toBe(false);
      expect(useCanvasStore.getState().cards).toHaveLength(1);
    });

    it("uses custom refId when provided", () => {
      const card = useCanvasStore.getState().addCard({
        type: "video",
        title: "Test",
        refId: "custom_ref",
      });

      expect(card.refId).toBe("custom_ref");
    });

    it("positions cards in a grid", () => {
      const c1 = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      const c2 = useCanvasStore.getState().addCard({ type: "image", title: "B" });

      expect(c2.x).toBeGreaterThan(c1.x);
      expect(useCanvasStore.getState().cards).toHaveLength(2);
    });
  });

  describe("updateCard", () => {
    it("patches card properties", () => {
      const card = useCanvasStore.getState().addCard({ type: "image", title: "Test" });
      useCanvasStore.getState().updateCard(card.id, { url: "http://example.com/img.png" });

      const updated = useCanvasStore.getState().cards.find((c) => c.id === card.id);
      expect(updated?.url).toBe("http://example.com/img.png");
    });
  });

  describe("removeCard", () => {
    it("removes card and associated edges", () => {
      const c1 = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      const c2 = useCanvasStore.getState().addCard({ type: "video", title: "B" });
      useCanvasStore.getState().addEdge(c1.refId, c2.refId, { capability: "ltx-i2v" });

      expect(useCanvasStore.getState().edges).toHaveLength(1);
      useCanvasStore.getState().removeCard(c1.id);

      expect(useCanvasStore.getState().cards).toHaveLength(1);
      expect(useCanvasStore.getState().edges).toHaveLength(0);
    });
  });

  describe("edges", () => {
    it("adds edges between cards", () => {
      const c1 = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      const c2 = useCanvasStore.getState().addCard({ type: "video", title: "B" });
      useCanvasStore.getState().addEdge(c1.refId, c2.refId, { capability: "ltx-i2v" });

      const edges = useCanvasStore.getState().edges;
      expect(edges).toHaveLength(1);
      expect(edges[0].fromRefId).toBe(c1.refId);
      expect(edges[0].toRefId).toBe(c2.refId);
    });

    it("updates existing edge meta", () => {
      const c1 = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      const c2 = useCanvasStore.getState().addCard({ type: "video", title: "B" });
      useCanvasStore.getState().addEdge(c1.refId, c2.refId, { capability: "v1" });
      useCanvasStore.getState().addEdge(c1.refId, c2.refId, { capability: "v2", elapsed: 1500 });

      expect(useCanvasStore.getState().edges).toHaveLength(1);
      expect(useCanvasStore.getState().edges[0].meta?.capability).toBe("v2");
      expect(useCanvasStore.getState().edges[0].meta?.elapsed).toBe(1500);
    });

    it("removes edges for a refId", () => {
      const c1 = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      const c2 = useCanvasStore.getState().addCard({ type: "video", title: "B" });
      const c3 = useCanvasStore.getState().addCard({ type: "image", title: "C" });
      useCanvasStore.getState().addEdge(c1.refId, c2.refId);
      useCanvasStore.getState().addEdge(c2.refId, c3.refId);

      useCanvasStore.getState().removeEdgesFor(c2.refId);
      expect(useCanvasStore.getState().edges).toHaveLength(0);
    });
  });

  describe("viewport", () => {
    it("sets viewport properties", () => {
      useCanvasStore.getState().setViewport({ panX: 100, panY: 200 });
      const vp = useCanvasStore.getState().viewport;
      expect(vp.panX).toBe(100);
      expect(vp.panY).toBe(200);
      expect(vp.scale).toBe(1);
    });

    it("zooms with clamping", () => {
      useCanvasStore.getState().zoomTo(10, 500, 500);
      expect(useCanvasStore.getState().viewport.scale).toBe(5); // clamped max

      useCanvasStore.getState().zoomTo(0.01, 500, 500);
      expect(useCanvasStore.getState().viewport.scale).toBe(0.1); // clamped min
    });

    it("fits all cards", () => {
      useCanvasStore.getState().addCard({ type: "image", title: "A" });
      useCanvasStore.getState().addCard({ type: "image", title: "B" });
      useCanvasStore.getState().fitAll(1920, 1080);

      const vp = useCanvasStore.getState().viewport;
      expect(vp.scale).toBeGreaterThan(0);
      expect(vp.scale).toBeLessThanOrEqual(2);
    });
  });

  describe("selection", () => {
    it("selects and deselects cards", () => {
      const card = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      useCanvasStore.getState().selectCard(card.id);
      expect(useCanvasStore.getState().selectedCardIds.has(card.id)).toBe(true);
      expect(useCanvasStore.getState().selectedCardIds.size).toBe(1);

      useCanvasStore.getState().selectCard(null);
      expect(useCanvasStore.getState().selectedCardIds.size).toBe(0);
    });

    it("toggles card selection with toggleCardSelection", () => {
      const card = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      const card2 = useCanvasStore.getState().addCard({ type: "image", title: "B" });

      useCanvasStore.getState().toggleCardSelection(card.id);
      expect(useCanvasStore.getState().selectedCardIds.has(card.id)).toBe(true);

      useCanvasStore.getState().toggleCardSelection(card2.id);
      expect(useCanvasStore.getState().selectedCardIds.size).toBe(2);

      useCanvasStore.getState().toggleCardSelection(card.id);
      expect(useCanvasStore.getState().selectedCardIds.has(card.id)).toBe(false);
      expect(useCanvasStore.getState().selectedCardIds.size).toBe(1);
    });

    it("selectCards sets multiple selections", () => {
      const card = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      const card2 = useCanvasStore.getState().addCard({ type: "image", title: "B" });

      useCanvasStore.getState().selectCards([card.id, card2.id]);
      expect(useCanvasStore.getState().selectedCardIds.size).toBe(2);
    });

    it("clearSelection empties selection", () => {
      const card = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      useCanvasStore.getState().selectCard(card.id);
      useCanvasStore.getState().clearSelection();
      expect(useCanvasStore.getState().selectedCardIds.size).toBe(0);
    });

    it("clears edge selection when card selected", () => {
      useCanvasStore.getState().selectEdge(2);
      expect(useCanvasStore.getState().selectedEdgeIdx).toBe(2);

      const card = useCanvasStore.getState().addCard({ type: "image", title: "A" });
      useCanvasStore.getState().selectCard(card.id);
      expect(useCanvasStore.getState().selectedCardIds.has(card.id)).toBe(true);
      expect(useCanvasStore.getState().selectedEdgeIdx).toBe(-1);
    });
  });
});
