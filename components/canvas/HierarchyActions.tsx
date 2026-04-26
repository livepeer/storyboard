"use client";

import { useMemo } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useEpisodeStore } from "@/lib/episodes/store";

/**
 * Hook: determines what hierarchy grouping actions are available
 * based on the current card selection.
 *
 * Used by SelectionBar to show "Group into Epic" / "Group into Story Arc" buttons.
 */
export function useHierarchyActions() {
  const selectedIds = useCanvasStore((s) => s.selectedCardIds);
  const episodes = useEpisodeStore((s) => s.episodes);
  const epics = useEpisodeStore((s) => s.epics);

  return useMemo(() => {
    if (selectedIds.size < 2) return { canGroupEpic: false, canGroupStory: false, episodeIds: [] as string[], epicIds: [] as string[] };

    // Find which episodes the selected cards belong to
    const episodeIds = new Set<string>();
    for (const cardId of selectedIds) {
      const ep = episodes.find((e) => e.cardIds.includes(cardId));
      if (ep && !ep.epicId) episodeIds.add(ep.id);
    }

    // Find which epics the selected cards belong to (through episodes)
    const epicIds = new Set<string>();
    for (const cardId of selectedIds) {
      const ep = episodes.find((e) => e.cardIds.includes(cardId));
      if (ep?.epicId) {
        const epic = epics.find((e) => e.id === ep.epicId);
        if (epic && !epic.storyId) epicIds.add(epic.id);
      }
    }

    return {
      canGroupEpic: episodeIds.size >= 2,
      canGroupStory: epicIds.size >= 2,
      episodeIds: Array.from(episodeIds),
      epicIds: Array.from(epicIds),
    };
  }, [selectedIds, episodes, epics]);
}
