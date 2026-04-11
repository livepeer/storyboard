"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { Card } from "./Card";
import { ArrowLayer } from "./ArrowEdge";
import { GroupButton } from "./GroupButton";
// EdgeInfoPopup is now inline in ArrowLayer (no separate component)

export function InfiniteCanvas() {
  const { viewport, cards, setViewport, zoomTo, selectCard, selectEdge, selectCards } =
    useCanvasStore();
  const panRef = useRef<{ startX: number; startY: number } | null>(null);
  const [lasso, setLasso] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; button: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-card]")) return;

      pointerStartRef.current = { x: e.clientX, y: e.clientY, button: e.button };
      panRef.current = {
        startX: e.clientX - viewport.panX,
        startY: e.clientY - viewport.panY,
      };

      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        selectCard(null);
      }
      selectEdge(-1);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [viewport.panX, viewport.panY, selectCard, selectEdge]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panRef.current || !pointerStartRef.current) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;

      // Left button + drag exceeds threshold → lasso mode
      if (pointerStartRef.current.button === 0 && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        const toCanvas = (sx: number, sy: number) => ({
          x: (sx - viewport.panX) / viewport.scale,
          y: (sy - viewport.panY) / viewport.scale,
        });
        const start = toCanvas(pointerStartRef.current.x, pointerStartRef.current.y);
        const end = toCanvas(e.clientX, e.clientY);
        setLasso({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        return;
      }

      // Otherwise pan
      setViewport({
        panX: e.clientX - panRef.current.startX,
        panY: e.clientY - panRef.current.startY,
      });
    },
    [setViewport, viewport.panX, viewport.panY, viewport.scale]
  );

  const onPointerUp = useCallback(() => {
    if (lasso) {
      const minX = Math.min(lasso.x1, lasso.x2);
      const maxX = Math.max(lasso.x1, lasso.x2);
      const minY = Math.min(lasso.y1, lasso.y2);
      const maxY = Math.max(lasso.y1, lasso.y2);

      const inside = cards.filter((c) => {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
      });
      if (inside.length > 0) {
        selectCards(inside.map((c) => c.id));
      }
      setLasso(null);
    }
    panRef.current = null;
    pointerStartRef.current = null;
  }, [lasso, cards, selectCards]);

  // Wheel zoom — must use ref-based listener with { passive: false }
  // because React attaches wheel events as passive by default,
  // which makes e.preventDefault() fail and floods the console.
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomTo(viewportRef.current.scale * factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomTo]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Dot grid — moves with pan/zoom to give sense of scale */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 0.8px, transparent 0)",
          backgroundSize: `${40 * viewport.scale}px ${40 * viewport.scale}px`,
          backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
        }}
      />
      {/* Transformed canvas layer */}
      <div
        className="absolute origin-top-left will-change-transform"
        style={{
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.scale})`,
          width: "100%",
          height: "100%",
        }}
      >
        <ArrowLayer />
        {lasso && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-blue-400/60 bg-blue-400/10 rounded"
            style={{
              left: Math.min(lasso.x1, lasso.x2),
              top: Math.min(lasso.y1, lasso.y2),
              width: Math.abs(lasso.x2 - lasso.x1),
              height: Math.abs(lasso.y2 - lasso.y1),
            }}
          />
        )}
        {cards.map((card) => (
          <div key={card.id} data-card>
            <Card card={card} />
          </div>
        ))}
      </div>
      {/* Edge popup is inline in ArrowLayer */}
      <GroupButton />
    </div>
  );
}
