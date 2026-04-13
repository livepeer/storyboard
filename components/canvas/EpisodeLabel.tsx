"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useEpisodeStore } from "@/lib/episodes/store";
import type { Card } from "@/lib/canvas/types";

const PADDING = 20;
const LABEL_HEIGHT = 32;

/**
 * Renders a visible labeled region behind each episode's cards on the canvas.
 * Lives in canvas coordinates (inside the transform layer).
 */
export function EpisodeLabels() {
  const cards = useCanvasStore((s) => s.cards);
  const episodes = useEpisodeStore((s) => s.episodes);
  const activeEpisodeId = useEpisodeStore((s) => s.activeEpisodeId);

  if (episodes.length === 0) return null;

  return (
    <>
      {episodes.map((ep) => {
        const epCards = cards.filter((c) => ep.cardIds.includes(c.id));
        if (epCards.length === 0) return null;
        return (
          <EpisodeLabelBox
            key={ep.id}
            episodeId={ep.id}
            name={ep.name}
            color={ep.color}
            cards={epCards}
            isActive={ep.id === activeEpisodeId}
          />
        );
      })}
    </>
  );
}

function EpisodeLabelBox({
  episodeId,
  name,
  color,
  cards,
  isActive,
}: {
  episodeId: string;
  name: string;
  color: string;
  cards: Card[];
  isActive: boolean;
}) {
  const allPinned = useMemo(() => cards.length > 0 && cards.every((c) => c.pinned), [cards]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute bounding box around all episode cards
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }

  const boxX = minX - PADDING;
  const boxY = minY - LABEL_HEIGHT - PADDING;
  const boxW = maxX - minX + PADDING * 2;
  const boxH = maxY - minY + LABEL_HEIGHT + PADDING * 2;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleRename = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== name) {
      useEpisodeStore.getState().updateEpisode(episodeId, { name: trimmed });
    }
    setEditing(false);
  }, [editName, name, episodeId]);

  const handleActivate = useCallback(() => {
    const store = useEpisodeStore.getState();
    store.activateEpisode(store.activeEpisodeId === episodeId ? null : episodeId);
  }, [episodeId]);

  // Convert hex color to rgba for reliable opacity control
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  return (
    <div
      className="absolute rounded-2xl"
      style={{
        left: boxX,
        top: boxY,
        width: boxW,
        height: boxH,
        background: `rgba(${r},${g},${b},${isActive ? 0.12 : 0.06})`,
        border: `2px ${isActive ? "solid" : "dashed"} rgba(${r},${g},${b},${isActive ? 0.5 : 0.25})`,
        boxShadow: isActive ? `0 0 24px rgba(${r},${g},${b},0.15)` : undefined,
        pointerEvents: "none",
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 rounded-l-2xl"
        style={{ width: 5, background: `rgba(${r},${g},${b},${isActive ? 0.7 : 0.35})` }}
      />

      {/* Label header — click to select all cards in episode */}
      <div
        className="flex items-center gap-2 px-4 py-1.5 cursor-pointer rounded-t-2xl transition-colors"
        style={{
          pointerEvents: "auto",
          background: `rgba(${r},${g},${b},0.08)`,
        }}
        onClick={() => {
          // Select all cards in this episode for group move
          useCanvasStore.getState().selectCards(cards.map((c) => c.id));
        }}
        title="Click to select all cards in this episode"
      >
        {/* Activate dot */}
        <button
          className="h-3.5 w-3.5 shrink-0 rounded-full cursor-pointer border-2"
          style={{
            backgroundColor: `rgba(${r},${g},${b},${isActive ? 1 : 0.5})`,
            borderColor: `rgba(${r},${g},${b},${isActive ? 0.8 : 0.3})`,
            boxShadow: isActive ? `0 0 8px rgba(${r},${g},${b},0.6)` : undefined,
          }}
          title={isActive ? "Deactivate episode" : "Activate episode"}
          onClick={handleActivate}
        />

        {/* Episode name */}
        {editing ? (
          <input
            ref={inputRef}
            className="bg-transparent text-sm font-bold outline-none border-b-2"
            style={{ color: `rgb(${r},${g},${b})`, borderColor: `rgba(${r},${g},${b},0.5)` }}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") { setEditName(name); setEditing(false); }
            }}
          />
        ) : (
          <span
            className="cursor-pointer text-sm font-bold select-none"
            style={{ color: `rgb(${r},${g},${b})` }}
            onDoubleClick={() => { setEditName(name); setEditing(true); }}
            title="Double-click to rename"
          >
            {name}
          </span>
        )}

        {/* Card count */}
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            color: `rgba(${r},${g},${b},0.8)`,
            background: `rgba(${r},${g},${b},0.12)`,
          }}
        >
          {cards.length} card{cards.length !== 1 ? "s" : ""}
        </span>

        <span className="flex-1" />

        {/* Pin button */}
        <button
          className={`text-xs cursor-pointer select-none transition-opacity ${
            allPinned ? "opacity-100" : "opacity-40 hover:opacity-80"
          }`}
          title={allPinned ? "Unpin all cards" : "Pin all cards"}
          onClick={() => {
            useCanvasStore.getState().pinCards(
              cards.map((c) => c.id),
              !allPinned
            );
          }}
        >
          {"\uD83D\uDCCC"}
        </button>
      </div>
    </div>
  );
}
