"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useEpisodeStore } from "@/lib/episodes/store";
import { useChatStore } from "@/lib/chat/store";
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

  // --- Group drag: move every card in this episode together ---
  //
  // The episode header acts as a handle. Clicking and dragging it
  // moves ALL cards in this episode by the same screen-space delta,
  // without touching cards in other episodes or ungrouped cards. Works
  // the same as multi-select + drag in Card.tsx but scoped to exactly
  // this episode — no need for the user to first select-then-drag.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    dragged: boolean;
    origins: Array<{ id: string; x: number; y: number; pinned: boolean; pinX?: number; pinY?: number }>;
  } | null>(null);
  // React's synthetic click fires AFTER pointerup, so we can't suppress
  // it just by nulling dragRef. Stash a short-lived "just dragged" flag
  // and check it from onClick.
  const justDraggedRef = useRef(false);

  const onEpisodeDragStart = useCallback(
    (e: React.PointerEvent) => {
      // Don't start a drag from buttons or the input — they have
      // their own onClick handlers and shouldn't move the group.
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("input")) return;
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        dragged: false,
        origins: cards.map((c) => ({
          id: c.id,
          x: c.x,
          y: c.y,
          pinned: !!c.pinned,
          pinX: c.pinX,
          pinY: c.pinY,
        })),
      };
      target.setPointerCapture(e.pointerId);
    },
    [cards]
  );

  const onEpisodeDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, origins } = dragRef.current;
    const rawDx = e.clientX - startX;
    const rawDy = e.clientY - startY;
    // Mark "actually dragged" after a small threshold so a normal
    // click (for rename/select) still registers its onClick.
    if (!dragRef.current.dragged && Math.hypot(rawDx, rawDy) < 3) return;
    dragRef.current.dragged = true;

    const scale = useCanvasStore.getState().viewport.scale;
    const canvasDx = rawDx / scale;
    const canvasDy = rawDy / scale;

    const update = useCanvasStore.getState().updateCard;
    for (const o of origins) {
      if (o.pinned && o.pinX !== undefined && o.pinY !== undefined) {
        // Pinned cards live in screen space — no scale divide,
        // and writes go to pinX/pinY.
        update(o.id, { pinX: o.pinX + rawDx, pinY: o.pinY + rawDy });
      } else {
        update(o.id, { x: o.x + canvasDx, y: o.y + canvasDy });
      }
    }
  }, []);

  const onEpisodeDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const moved = dragRef.current.dragged;
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { /* not captured */ }
    if (moved) {
      // React's synthetic click fires AFTER pointerup on the same
      // target. Raise a tiny flag so onClick knows to bail. Cleared on
      // the next microtask so the very next click still works normally.
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

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

      {/* Label header — drag to move the whole episode, click to select it */}
      <div
        className="flex items-center gap-2 px-4 py-1.5 cursor-grab active:cursor-grabbing rounded-t-2xl transition-colors select-none"
        style={{
          pointerEvents: "auto",
          background: `rgba(${r},${g},${b},0.08)`,
          touchAction: "none",
        }}
        onPointerDown={onEpisodeDragStart}
        onPointerMove={onEpisodeDragMove}
        onPointerUp={onEpisodeDragEnd}
        onPointerCancel={onEpisodeDragEnd}
        onClick={(e) => {
          // If the user just finished a drag, the drag flag is set.
          // Don't re-select (which would clear nothing but feels wrong).
          if (justDraggedRef.current) return;
          // Don't propagate to canvas — we're handling it here.
          e.stopPropagation();
          useCanvasStore.getState().selectCards(cards.map((c) => c.id));
        }}
        title="Drag to move the whole episode · Click to select all cards"
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

        {/* Episode actions — select all cards to show SelectionBar */}
        <button
          className="text-xs cursor-pointer select-none opacity-40 hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            useCanvasStore.getState().selectCards(cards.map((c) => c.id));
          }}
          title="Select all → use bar above to render, export, animate"
        >
          {"\u22EF"}
        </button>
      </div>
    </div>
  );
}
