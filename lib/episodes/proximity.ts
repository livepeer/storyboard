/**
 * Proximity detection for drag-to-group interactions.
 *
 * Checks if a dragged entity is near another entity's area:
 * - Card near Episode → "Add to episode?"
 * - Episode near Episode (different, both unepiced) → "Group into epic?"
 * - Epic near Epic (different, both unstoried) → "Group into story arc?"
 */

import { useEpisodeStore } from "./store";
import { useCanvasStore } from "@/lib/canvas/store";
import { getCardIdsForEpic, getCardsById, computeBoundingBox, isPointInBox } from "./bounding-box";

const EPISODE_PADDING = 20;
const EPISODE_LABEL_H = 32;
const EPIC_PADDING = 36;
const EPIC_LABEL_H = 38;

export interface ProximityResult {
  type: "episode" | "epic" | "story";
  targetId: string;
  targetName: string;
  sourceId: string;
}

/** Check if a card center is inside an episode area (existing logic, extracted). */
export function checkCardToEpisodeProximity(
  cardId: string,
  cx: number,
  cy: number,
): ProximityResult | null {
  const store = useEpisodeStore.getState();
  const canvas = useCanvasStore.getState();

  for (const ep of store.episodes) {
    if (ep.cardIds.includes(cardId)) continue; // already in this episode
    const epCards = canvas.cards.filter((c) => ep.cardIds.includes(c.id));
    if (epCards.length === 0) continue;
    const box = computeBoundingBox(epCards, EPISODE_PADDING, EPISODE_LABEL_H);
    if (box && isPointInBox(cx, cy, box)) {
      return { type: "episode", targetId: ep.id, targetName: ep.name, sourceId: cardId };
    }
  }
  return null;
}

/** Check if an episode's center is near another unepiced episode → "Group into epic?" */
export function checkEpisodeToEpicProximity(
  episodeId: string,
  cx: number,
  cy: number,
): ProximityResult | null {
  const store = useEpisodeStore.getState();
  const canvas = useCanvasStore.getState();
  const sourceEp = store.getEpisode(episodeId);
  if (!sourceEp || sourceEp.epicId) return null; // already in an epic

  for (const ep of store.episodes) {
    if (ep.id === episodeId) continue;
    if (ep.epicId) continue; // already in an epic
    const epCards = canvas.cards.filter((c) => ep.cardIds.includes(c.id));
    if (epCards.length === 0) continue;
    const box = computeBoundingBox(epCards, EPISODE_PADDING, EPISODE_LABEL_H);
    if (box && isPointInBox(cx, cy, box)) {
      return { type: "epic", targetId: ep.id, targetName: ep.name, sourceId: episodeId };
    }
  }
  return null;
}

/** Check if an epic's center is near another unstoried epic → "Group into story arc?" */
export function checkEpicToStoryProximity(
  epicId: string,
  cx: number,
  cy: number,
): ProximityResult | null {
  const store = useEpisodeStore.getState();

  for (const epic of store.epics) {
    if (epic.id === epicId) continue;
    if (epic.storyId) continue; // already in a story
    const cardIds = getCardIdsForEpic(epic.id);
    const cards = getCardsById(cardIds);
    if (cards.length === 0) continue;
    const box = computeBoundingBox(cards, EPIC_PADDING, EPIC_LABEL_H);
    if (box && isPointInBox(cx, cy, box)) {
      return { type: "story", targetId: epic.id, targetName: epic.name, sourceId: epicId };
    }
  }
  return null;
}
