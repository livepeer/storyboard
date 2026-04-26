/**
 * Shared hook for group-drag behavior on hierarchy labels.
 *
 * Dragging the label header moves ALL cards in the group together.
 * Used by: EpisodeLabel, EpicLabel, StoryLabel.
 */
import { useCallback, useRef } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import type { Card } from "@/lib/canvas/types";

interface DragState {
  startX: number;
  startY: number;
  dragged: boolean;
  origins: Array<{ id: string; x: number; y: number; pinned: boolean; pinX?: number; pinY?: number }>;
}

export function useGroupDrag(cards: Card[]) {
  const dragRef = useRef<DragState | null>(null);
  const justDraggedRef = useRef(false);

  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("input")) return;
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        dragged: false,
        origins: cards.map((c) => ({
          id: c.id, x: c.x, y: c.y,
          pinned: !!c.pinned, pinX: c.pinX, pinY: c.pinY,
        })),
      };
      target.setPointerCapture(e.pointerId);
    },
    [cards],
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, origins } = dragRef.current;
    const rawDx = e.clientX - startX;
    const rawDy = e.clientY - startY;
    if (!dragRef.current.dragged && Math.hypot(rawDx, rawDy) < 3) return;
    dragRef.current.dragged = true;

    const scale = useCanvasStore.getState().viewport.scale;
    const canvasDx = rawDx / scale;
    const canvasDy = rawDy / scale;
    const update = useCanvasStore.getState().updateCard;
    for (const o of origins) {
      if (o.pinned && o.pinX !== undefined && o.pinY !== undefined) {
        update(o.id, { pinX: o.pinX + rawDx, pinY: o.pinY + rawDy });
      } else {
        update(o.id, { x: o.x + canvasDx, y: o.y + canvasDy });
      }
    }
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const moved = dragRef.current.dragged;
    dragRef.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (moved) {
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 0);
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  return { onDragStart, onDragMove, onDragEnd, justDraggedRef };
}
