/**
 * Shared geometry utilities for the content hierarchy.
 *
 * Used by: EpicLabel, StoryLabel, proximity detection, fitCards.
 * Single source of truth for bounding-box math across all levels.
 */

import { useEpisodeStore } from "./store";
import { useCanvasStore } from "@/lib/canvas/store";
import type { Card } from "@/lib/canvas/types";

/** Get all card IDs belonging to an epic (through its episodes). */
export function getCardIdsForEpic(epicId: string): string[] {
  const store = useEpisodeStore.getState();
  const epic = store.getEpic(epicId);
  if (!epic) return [];
  const ids: string[] = [];
  for (const epId of epic.episodeIds) {
    const ep = store.getEpisode(epId);
    if (ep) ids.push(...ep.cardIds);
  }
  return ids;
}

/** Get all card IDs belonging to a story (through its epics and episodes). */
export function getCardIdsForStory(storyId: string): string[] {
  const store = useEpisodeStore.getState();
  const story = store.getStory(storyId);
  if (!story) return [];
  const ids: string[] = [];
  for (const epicId of story.epicIds) {
    ids.push(...getCardIdsForEpic(epicId));
  }
  return ids;
}

/** Get Card objects for a set of IDs. */
export function getCardsById(cardIds: string[]): Card[] {
  const idSet = new Set(cardIds);
  return useCanvasStore.getState().cards.filter((c) => idSet.has(c.id));
}

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Compute bounding box around a set of cards with padding + label height. */
export function computeBoundingBox(
  cards: Card[],
  padding: number,
  labelHeight: number,
): BoundingBox | null {
  if (cards.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }
  return {
    x: minX - padding,
    y: minY - labelHeight - padding,
    w: maxX - minX + padding * 2,
    h: maxY - minY + labelHeight + padding * 2,
  };
}

/** Check if a point is inside a bounding box. */
export function isPointInBox(px: number, py: number, box: BoundingBox): boolean {
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
}
