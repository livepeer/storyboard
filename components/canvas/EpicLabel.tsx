"use client";

import { useMemo } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useEpisodeStore } from "@/lib/episodes/store";
import { useGroupDrag } from "@/lib/episodes/use-group-drag";
import type { Card } from "@/lib/canvas/types";

const EPIC_PADDING = 36;
const EPIC_LABEL_HEIGHT = 38;

/**
 * Renders a visible labeled region behind each epic's cards on the canvas.
 * An epic spans multiple episodes — its bounding box encloses all cards
 * from all child episodes.
 */
export function EpicLabels() {
  const cards = useCanvasStore((s) => s.cards);
  const epics = useEpisodeStore((s) => s.epics);

  if (epics.length === 0) return null;

  return (
    <>
      {epics.map((epic) => {
        const store = useEpisodeStore.getState();
        const cardIds = epic.episodeIds.flatMap(
          (epId) => store.getEpisode(epId)?.cardIds || []
        );
        const epicCards = cards.filter((c) => cardIds.includes(c.id));
        if (epicCards.length === 0) return null;
        return (
          <EpicLabelBox
            key={epic.id}
            epicId={epic.id}
            name={epic.name}
            color={epic.color}
            cards={epicCards}
            isActive={false}
          />
        );
      })}
    </>
  );
}

function EpicLabelBox({
  epicId,
  name,
  color,
  cards,
  isActive,
}: {
  epicId: string;
  name: string;
  color: string;
  cards: Card[];
  isActive: boolean;
}) {
  const episodeCount = useMemo(() => {
    const epic = useEpisodeStore.getState().getEpic(epicId);
    return epic?.episodeIds.length ?? 0;
  }, [epicId]);

  const { onDragStart, onDragMove, onDragEnd, justDraggedRef } = useGroupDrag(cards);

  // Compute bounding box around all epic cards
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

  const boxX = minX - EPIC_PADDING;
  const boxY = minY - EPIC_LABEL_HEIGHT - EPIC_PADDING;
  const boxW = maxX - minX + EPIC_PADDING * 2;
  const boxH = maxY - minY + EPIC_LABEL_HEIGHT + EPIC_PADDING * 2;

  // Convert hex color to rgba for reliable opacity control
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  return (
    <div
      className="absolute rounded-3xl"
      style={{
        left: boxX,
        top: boxY,
        width: boxW,
        height: boxH,
        background: `rgba(${r},${g},${b},0.04)`,
        border: `3px dashed rgba(${r},${g},${b},0.25)`,
        pointerEvents: "none",
      }}
    >
      {/* Label header — drag to move all cards */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-grab active:cursor-grabbing select-none"
        style={{ pointerEvents: "auto", touchAction: "none" }}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onClick={(e) => {
          if (justDraggedRef.current) return;
          e.stopPropagation();
          useCanvasStore.getState().selectCards(cards.map((c) => c.id));
        }}
        title="Drag to move · Click to select all"
      >
        {/* Epic name */}
        <span
          className="text-sm font-bold select-none"
          style={{ color: `rgb(${r},${g},${b})` }}
        >
          {name}
        </span>

        {/* Episode + card count badge */}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            color: `rgba(${r},${g},${b},0.8)`,
            background: `rgba(${r},${g},${b},0.12)`,
          }}
        >
          {episodeCount} ep{episodeCount !== 1 ? "s" : ""} &middot;{" "}
          {cards.length} card{cards.length !== 1 ? "s" : ""}
        </span>

        <span className="flex-1" />

        {/* Select all cards in this epic */}
        <button
          className="text-xs cursor-pointer select-none opacity-40 hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            useCanvasStore.getState().selectCards(cards.map((c) => c.id));
          }}
          title="Select all cards in this epic"
        >
          {"\u22EF"}
        </button>
      </div>
    </div>
  );
}
