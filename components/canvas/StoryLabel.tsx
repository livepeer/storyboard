"use client";

import { useMemo } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useEpisodeStore } from "@/lib/episodes/store";
import type { Card } from "@/lib/canvas/types";

const STORY_PADDING = 52;
const STORY_LABEL_HEIGHT = 44;

/**
 * Renders a visible labeled region behind each story's cards on the canvas.
 * A story spans multiple epics, each of which spans multiple episodes.
 * The bounding box encloses all cards reachable through the story's
 * epic -> episode -> card hierarchy.
 */
export function StoryLabels() {
  const cards = useCanvasStore((s) => s.cards);
  const stories = useEpisodeStore((s) => s.stories);

  if (stories.length === 0) return null;

  return (
    <>
      {stories.map((story) => {
        const store = useEpisodeStore.getState();
        const cardIds = story.epicIds.flatMap((epicId) => {
          const epic = store.getEpic(epicId);
          if (!epic) return [];
          return epic.episodeIds.flatMap(
            (epId) => store.getEpisode(epId)?.cardIds || []
          );
        });
        const storyCards = cards.filter((c) => cardIds.includes(c.id));
        if (storyCards.length === 0) return null;
        return (
          <StoryLabelBox
            key={story.id}
            storyId={story.id}
            name={story.name}
            color={story.color}
            cards={storyCards}
          />
        );
      })}
    </>
  );
}

function StoryLabelBox({
  storyId,
  name,
  color,
  cards,
}: {
  storyId: string;
  name: string;
  color: string;
  cards: Card[];
}) {
  const { epicCount, episodeCount } = useMemo(() => {
    const store = useEpisodeStore.getState();
    const story = store.getStory(storyId);
    const epics = story?.epicIds.length ?? 0;
    const episodes = (story?.epicIds ?? []).reduce((sum, epicId) => {
      const epic = store.getEpic(epicId);
      return sum + (epic?.episodeIds.length ?? 0);
    }, 0);
    return { epicCount: epics, episodeCount: episodes };
  }, [storyId]);

  // Compute bounding box around all story cards
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }

  const boxX = minX - STORY_PADDING;
  const boxY = minY - STORY_LABEL_HEIGHT - STORY_PADDING;
  const boxW = maxX - minX + STORY_PADDING * 2;
  const boxH = maxY - minY + STORY_LABEL_HEIGHT + STORY_PADDING * 2;

  // Convert hex color to rgba for reliable opacity control
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  return (
    <div
      className="absolute rounded-[20px]"
      style={{
        left: boxX,
        top: boxY,
        width: boxW,
        height: boxH,
        background: `rgba(${r},${g},${b},0.02)`,
        border: `4px dashed rgba(${r},${g},${b},0.25)`,
        pointerEvents: "none",
      }}
    >
      {/* Label header */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ pointerEvents: "auto" }}
      >
        {/* Story name */}
        <span
          className="text-sm font-bold select-none"
          style={{ color: `rgb(${r},${g},${b})` }}
        >
          {name}
        </span>

        {/* Epic + episode + card count badge */}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            color: `rgba(${r},${g},${b},0.8)`,
            background: `rgba(${r},${g},${b},0.12)`,
          }}
        >
          {epicCount} epic{epicCount !== 1 ? "s" : ""} &middot;{" "}
          {episodeCount} ep{episodeCount !== 1 ? "s" : ""} &middot;{" "}
          {cards.length} card{cards.length !== 1 ? "s" : ""}
        </span>

        <span className="flex-1" />

        {/* Select all cards in this story */}
        <button
          className="text-xs cursor-pointer select-none opacity-40 hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            useCanvasStore.getState().selectCards(cards.map((c) => c.id));
          }}
          title="Select all cards in this story"
        >
          {"\u22EF"}
        </button>
      </div>
    </div>
  );
}
