import type { CanvasCard } from "./store.js";
import type { CanvasStore } from "./store.js";

const CARD_W = 320;
const CARD_H = 200;
const GAP = 24;

/**
 * Grid layout: cards are placed in a grid, grouped by batchId so same-batch
 * cards stay contiguous. Within each group, cards fill left-to-right, then
 * wrap to the next row.
 */
export function autoLayout(store: CanvasStore, cols = 4): void {
  const groups = new Map<string, CanvasCard[]>();
  for (const c of store.list()) {
    const key = c.batchId ?? c.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  let i = 0;
  for (const cards of groups.values()) {
    for (const c of cards) {
      c.x = (i % cols) * (CARD_W + GAP);
      c.y = Math.floor(i / cols) * (CARD_H + GAP);
      i++;
    }
  }
}

/**
 * Narrative layout: one row per batchId. Cards from the same prompt batch
 * flow horizontally; different prompt batches stack as separate rows.
 */
export function narrativeLayout(store: CanvasStore): void {
  const groups = new Map<string, CanvasCard[]>();
  for (const c of store.list()) {
    const key = c.batchId ?? "_";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  let row = 0;
  for (const cards of groups.values()) {
    cards.forEach((c, col) => {
      c.x = col * (CARD_W + GAP);
      c.y = row * (CARD_H + GAP);
    });
    row++;
  }
}
