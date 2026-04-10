import { create } from "zustand";
import type { Card, ArrowEdge, CanvasViewport, CardType } from "./types";

const CARD_W = 320;
const CARD_H = 280;
const GAP = 24;
const COLS_PER_ROW = 5;

let nextCardId = 0;

interface CanvasState {
  viewport: CanvasViewport;
  cards: Card[];
  edges: ArrowEdge[];
  selectedCardId: string | null;
  selectedEdgeIdx: number;

  // Viewport actions
  setViewport: (v: Partial<CanvasViewport>) => void;
  zoomTo: (scale: number, centerX: number, centerY: number) => void;
  fitAll: (viewportWidth: number, viewportHeight: number) => void;

  // Layout
  layoutTimeline: (refIds: string[], cols?: number) => void;
  autoLayout: () => void;
  narrativeLayout: () => void;

  // Card actions
  addCard: (opts: {
    type: CardType;
    title: string;
    refId?: string;
    width?: number;
    height?: number;
    url?: string;
  }) => Card;
  updateCard: (id: string, patch: Partial<Card>) => void;
  removeCard: (id: string) => void;
  selectCard: (id: string | null) => void;

  // Edge actions
  addEdge: (fromRefId: string, toRefId: string, meta?: ArrowEdge["meta"]) => void;
  removeEdgesFor: (refId: string) => void;
  selectEdge: (idx: number) => void;
}

function nextPosition(cards: Card[]): { x: number; y: number } {
  // Simple grid: place at next slot based on card count
  // Cards placed by autoLayout or layoutTimeline get proper positions;
  // new cards just go to the next available grid slot.
  const n = cards.length;
  const col = n % COLS_PER_ROW;
  const row = Math.floor(n / COLS_PER_ROW);
  return {
    x: GAP + col * (CARD_W + GAP),
    y: GAP + 48 + row * (CARD_H + GAP),
  };
}

function makeRefId(type: CardType, id: number): string {
  return `${type}_${id}`;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  viewport: { panX: 0, panY: 0, scale: 1 },
  cards: [],
  edges: [],
  selectedCardId: null,
  selectedEdgeIdx: -1,

  setViewport: (v) =>
    set((s) => ({ viewport: { ...s.viewport, ...v } })),

  zoomTo: (newScale, centerX, centerY) =>
    set((s) => {
      const { panX, panY, scale } = s.viewport;
      const worldX = (centerX - panX) / scale;
      const worldY = (centerY - panY) / scale;
      const clamped = Math.max(0.1, Math.min(5, newScale));
      return {
        viewport: {
          scale: clamped,
          panX: centerX - worldX * clamped,
          panY: centerY - worldY * clamped,
        },
      };
    }),

  fitAll: (vw, vh) =>
    set((s) => {
      const { cards } = s;
      if (cards.length === 0) return { viewport: { panX: 0, panY: 0, scale: 1 } };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of cards) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.w);
        maxY = Math.max(maxY, c.y + c.h);
      }
      const cw = maxX - minX;
      const ch = maxY - minY;
      const pad = 80;
      const scale = Math.min((vw - pad) / cw, (vh - pad) / ch, 2);
      return {
        viewport: {
          scale,
          panX: (vw - cw * scale) / 2 - minX * scale,
          panY: (vh - ch * scale) / 2 - minY * scale,
        },
      };
    }),

  addCard: (opts) => {
    const id = String(nextCardId++);
    const refId = opts.refId || makeRefId(opts.type, Number(id));
    const pos = nextPosition(get().cards);
    const card: Card = {
      id,
      refId,
      type: opts.type,
      title: opts.title,
      x: pos.x,
      y: pos.y,
      w: opts.width || CARD_W,
      h: opts.height || CARD_H,
      minimized: false,
      url: opts.url,
    };
    set((s) => ({ cards: [...s.cards, card] }));
    return card;
  },

  updateCard: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  removeCard: (id) =>
    set((s) => {
      const card = s.cards.find((c) => c.id === id);
      if (!card) return s;
      return {
        cards: s.cards.filter((c) => c.id !== id),
        edges: s.edges.filter(
          (e) => e.fromRefId !== card.refId && e.toRefId !== card.refId
        ),
        selectedCardId: s.selectedCardId === id ? null : s.selectedCardId,
      };
    }),

  selectCard: (id) => set({ selectedCardId: id, selectedEdgeIdx: -1 }),

  addEdge: (fromRefId, toRefId, meta) =>
    set((s) => {
      const exists = s.edges.find(
        (e) => e.fromRefId === fromRefId && e.toRefId === toRefId
      );
      if (exists) {
        return {
          edges: s.edges.map((e) =>
            e.fromRefId === fromRefId && e.toRefId === toRefId
              ? { ...e, meta }
              : e
          ),
        };
      }
      return { edges: [...s.edges, { fromRefId, toRefId, meta }] };
    }),

  removeEdgesFor: (refId) =>
    set((s) => ({
      edges: s.edges.filter(
        (e) => e.fromRefId !== refId && e.toRefId !== refId
      ),
    })),

  selectEdge: (idx) => set({ selectedEdgeIdx: idx, selectedCardId: null }),

  layoutTimeline: (refIds, cols = 5) =>
    set((s) => {
      const cards = s.cards.map((c) => {
        const idx = refIds.indexOf(c.refId);
        if (idx < 0) return c;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        return {
          ...c,
          x: GAP + col * (CARD_W + GAP),
          y: GAP + 48 + row * (CARD_H + GAP),
        };
      });
      return { cards };
    }),

  /** Auto-layout ALL cards in a clean grid — no overlaps */
  autoLayout: () =>
    set((s) => {
      // Group: project scenes first (by edge order), then standalone cards
      const edgeOrder: string[] = [];
      const visited = new Set<string>();

      // Find root cards (no incoming edges)
      const hasIncoming = new Set(s.edges.map((e) => e.toRefId));
      const roots = s.cards.filter((c) => !hasIncoming.has(c.refId));

      // BFS from roots following edges to get narrative order
      const queue = [...roots.map((c) => c.refId)];
      while (queue.length > 0) {
        const refId = queue.shift()!;
        if (visited.has(refId)) continue;
        visited.add(refId);
        edgeOrder.push(refId);
        // Find outgoing edges
        for (const e of s.edges) {
          if (e.fromRefId === refId && !visited.has(e.toRefId)) {
            queue.push(e.toRefId);
          }
        }
      }

      // Add any remaining cards not in edge graph
      for (const c of s.cards) {
        if (!visited.has(c.refId)) {
          edgeOrder.push(c.refId);
        }
      }

      // Layout in grid following narrative order
      const cards = s.cards.map((c) => {
        const idx = edgeOrder.indexOf(c.refId);
        if (idx < 0) return c;
        const col = idx % COLS_PER_ROW;
        const row = Math.floor(idx / COLS_PER_ROW);
        return {
          ...c,
          x: GAP + col * (CARD_W + GAP),
          y: GAP + 48 + row * (CARD_H + GAP),
        };
      });
      return { cards };
    }),

  /** Narrative layout: horizontal chain following edge flow, branches below */
  narrativeLayout: () =>
    set((s) => {
      const hasIncoming = new Set(s.edges.map((e) => e.toRefId));
      const roots = s.cards.filter((c) => !hasIncoming.has(c.refId));
      const visited = new Set<string>();
      const order: string[] = [];
      const queue = [...roots.map((c) => c.refId)];
      while (queue.length > 0) {
        const refId = queue.shift()!;
        if (visited.has(refId)) continue;
        visited.add(refId);
        order.push(refId);
        for (const e of s.edges) {
          if (e.fromRefId === refId && !visited.has(e.toRefId)) {
            queue.push(e.toRefId);
          }
        }
      }
      for (const c of s.cards) {
        if (!visited.has(c.refId)) order.push(c.refId);
      }

      const positions = new Map<string, { x: number; y: number }>();
      let nextX = GAP;
      const baseY = GAP + 48;

      for (const refId of order) {
        const parentEdge = s.edges.find(
          (e) => e.toRefId === refId && positions.has(e.fromRefId)
        );
        const isTransform = parentEdge && parentEdge.meta?.action !== "sequence";

        if (isTransform && parentEdge) {
          const parentPos = positions.get(parentEdge.fromRefId)!;
          positions.set(refId, { x: parentPos.x, y: parentPos.y + CARD_H + GAP });
        } else {
          positions.set(refId, { x: nextX, y: baseY });
          nextX += CARD_W + GAP;
        }
      }

      const cards = s.cards.map((c) => {
        const pos = positions.get(c.refId);
        return pos ? { ...c, x: pos.x, y: pos.y } : c;
      });
      return { cards };
    }),
}));
