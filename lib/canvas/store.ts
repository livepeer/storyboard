import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Card, ArrowEdge, CanvasViewport, CardType } from "./types";
import { recordNegative, recordPositive, createHistoryManager, type CanvasSnapshot } from "@livepeer/creative-kit";

export const history = createHistoryManager();

const CARD_W = 320;
const CARD_H = 280;
const GAP = 24;
const COLS_PER_ROW = 5;

let nextCardId = Date.now();

interface CanvasState {
  viewport: CanvasViewport;
  cards: Card[];
  edges: ArrowEdge[];
  selectedCardIds: Set<string>;
  selectedEdgeIdx: number;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Viewport actions
  setViewport: (v: Partial<CanvasViewport>) => void;
  zoomTo: (scale: number, centerX: number, centerY: number) => void;
  fitAll: (viewportWidth: number, viewportHeight: number) => void;

  // Layout
  applyLayout: (positions: Array<{ cardId: string; x: number; y: number; w?: number; h?: number }>) => void;

  // Card actions
  addCard: (opts: {
    type: CardType;
    title: string;
    refId?: string;
    width?: number;
    height?: number;
    url?: string;
    batchId?: string;
  }) => Card;
  updateCard: (id: string, patch: Partial<Card>) => void;
  removeCard: (id: string) => void;
  selectCard: (id: string | null) => void;
  toggleCardSelection: (id: string) => void;
  selectCards: (ids: string[]) => void;
  clearSelection: () => void;
  togglePin: (id: string) => void;
  pinCards: (ids: string[], pinned: boolean) => void;

  // Edge actions
  addEdge: (fromRefId: string, toRefId: string, meta?: ArrowEdge["meta"]) => void;
  removeEdgesFor: (refId: string) => void;
  selectEdge: (idx: number) => void;
}

function nextPosition(cards: Card[]): { x: number; y: number } {
  // Simple grid: place at next slot based on card count
  // Cards placed by applyLayout get proper positions;
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

const MAX_PERSISTED_CARDS = 100;

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
  viewport: { panX: 0, panY: 0, scale: 1 },
  cards: [],
  edges: [],
  selectedCardIds: new Set<string>(),
  selectedEdgeIdx: -1,

  undo: () => {
    const { cards } = get();
    const prev = history.undo();
    if (!prev) return;
    set({ cards: prev.cards as Card[], edges: prev.edges as ArrowEdge[] });
    // Chat feedback
    const diff = cards.length - (prev.cards?.length || 0);
    const msg = diff > 0 ? `Undone: removed ${diff} card${diff > 1 ? "s" : ""}` : diff < 0 ? `Undone: restored ${-diff} card${-diff > 1 ? "s" : ""}` : "Undone";
    try { import("@/lib/chat/store").then((m) => m.useChatStore.getState().addMessage(msg, "system")); } catch {}
  },

  redo: () => {
    const { cards } = get();
    const next = history.redo();
    if (!next) return;
    set({ cards: next.cards as Card[], edges: next.edges as ArrowEdge[] });
    const diff = (next.cards?.length || 0) - cards.length;
    const msg = diff > 0 ? `Redone: restored ${diff} card${diff > 1 ? "s" : ""}` : diff < 0 ? `Redone: removed ${-diff} card${-diff > 1 ? "s" : ""}` : "Redone";
    try { import("@/lib/chat/store").then((m) => m.useChatStore.getState().addMessage(msg, "system")); } catch {}
  },

  canUndo: () => history.canUndo,
  canRedo: () => history.canRedo,

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
    history.pushUndo({ cards: get().cards, edges: get().edges });
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
      batchId: opts.batchId,
    };
    set((s) => ({ cards: [...s.cards, card] }));
    return card;
  },

  updateCard: (id, patch) =>
    set((s) => ({
      cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  removeCard: (id) => {
    history.pushUndo({ cards: get().cards, edges: get().edges });
    return set((s) => {
      const card = s.cards.find((c) => c.id === id);
      if (!card) return s;
      // Record negative signal — user deleted this card
      if (card.url) {
        // Extract capability hint from the refId (e.g. "flux-dev_123" → "flux-dev")
        const cap = card.refId?.split("_")[0];
        if (cap && cap.includes("-")) recordNegative("model", cap, 1);
        if (card.type === "image") recordNegative("style", "image", 0.5);
      }
      return {
        cards: s.cards.filter((c) => c.id !== id),
        edges: s.edges.filter(
          (e) => e.fromRefId !== card.refId && e.toRefId !== card.refId
        ),
        selectedCardIds: (() => {
          const next = new Set(s.selectedCardIds);
          next.delete(id);
          return next;
        })(),
      };
    });
  },

  selectCard: (id) =>
    set({ selectedCardIds: new Set(id ? [id] : []), selectedEdgeIdx: -1 }),

  toggleCardSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedCardIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedCardIds: next, selectedEdgeIdx: -1 };
    }),

  selectCards: (ids) =>
    set({ selectedCardIds: new Set(ids), selectedEdgeIdx: -1 }),

  clearSelection: () =>
    set({ selectedCardIds: new Set(), selectedEdgeIdx: -1 }),

  togglePin: (id) =>
    set((s) => {
      const { panX, panY, scale } = s.viewport;
      return {
        cards: s.cards.map((c) => {
          if (c.id !== id) return c;
          if (c.pinned) {
            // Unpin — drop screen-space snapshot
            return { ...c, pinned: false, pinX: undefined, pinY: undefined, pinScale: undefined };
          }
          // Pin — snapshot current screen position so the card stays where
          // the user sees it rather than rendering at raw canvas coords.
          return {
            ...c,
            pinned: true,
            pinX: panX + c.x * scale,
            pinY: panY + c.y * scale,
            pinScale: scale,
          };
        }),
      };
    }),

  pinCards: (ids, pinned) =>
    set((s) => {
      const idSet = new Set(ids);
      const { panX, panY, scale } = s.viewport;
      return {
        cards: s.cards.map((c) => {
          if (!idSet.has(c.id)) return c;
          if (!pinned) {
            return { ...c, pinned: false, pinX: undefined, pinY: undefined, pinScale: undefined };
          }
          return {
            ...c,
            pinned: true,
            pinX: panX + c.x * scale,
            pinY: panY + c.y * scale,
            pinScale: scale,
          };
        }),
      };
    }),

  addEdge: (fromRefId, toRefId, meta) => {
    history.pushUndo({ cards: get().cards, edges: get().edges });
    return set((s) => {
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
      return { edges: [...s.edges, { id: `${fromRefId}-->${toRefId}`, fromRefId, toRefId, meta }] };
    });
  },

  removeEdgesFor: (refId) =>
    set((s) => ({
      edges: s.edges.filter(
        (e) => e.fromRefId !== refId && e.toRefId !== refId
      ),
    })),

  selectEdge: (idx) => set({ selectedEdgeIdx: idx, selectedCardIds: new Set() }),

  applyLayout: (positions) => {
    history.pushUndo({ cards: get().cards, edges: get().edges });
    return set((s) => {
      const posMap = new Map(positions.map((p) => [p.cardId, p]));
      const cards = s.cards.map((c) => {
        const pos = posMap.get(c.id);
        if (!pos) return c;
        return {
          ...c,
          x: pos.x,
          y: pos.y,
          ...(pos.w !== undefined ? { w: pos.w } : {}),
          ...(pos.h !== undefined ? { h: pos.h } : {}),
        };
      });
      return { cards };
    });
  },
}),
    {
      name: "storyboard_canvas",
      version: 1,
      partialize: (state) => ({
        // Only persist cards (capped) and edges — not viewport, selection, or edge selection
        cards: state.cards.slice(-MAX_PERSISTED_CARDS),
        edges: state.edges,
      }),
      // Set is not serializable — selectedCardIds is excluded via partialize
      // On rehydrate, ensure nextCardId doesn't collide with restored cards
      onRehydrateStorage: () => (state) => {
        if (state?.cards?.length) {
          const maxId = Math.max(...state.cards.map((c) => parseInt(c.id) || 0));
          if (maxId >= nextCardId) nextCardId = maxId + 1;

          // Detect blob URLs that won't survive refresh — mark as expired
          for (const card of state.cards) {
            if (card.url && card.url.startsWith("blob:")) {
              card.error = "Local media expired after refresh. Use /render or /mix again to regenerate, or /save canvas before closing.";
              card.url = undefined;
            }
          }
        }
      },
    },
  ),
);
