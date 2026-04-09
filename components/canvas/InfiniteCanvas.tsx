"use client";

import { useCallback, useRef } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { Card } from "./Card";
import { ArrowLayer } from "./ArrowEdge";
import { EdgeInfoPopup } from "./EdgeInfoPopup";

export function InfiniteCanvas() {
  const { viewport, cards, setViewport, zoomTo, selectCard, selectEdge } =
    useCanvasStore();
  const panRef = useRef<{ startX: number; startY: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only pan on background click (button 0 or middle button 1)
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-card]")) return;

      panRef.current = {
        startX: e.clientX - viewport.panX,
        startY: e.clientY - viewport.panY,
      };
      selectCard(null);
      selectEdge(-1);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [viewport.panX, viewport.panY, selectCard, selectEdge]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panRef.current) return;
      setViewport({
        panX: e.clientX - panRef.current.startX,
        panY: e.clientY - panRef.current.startY,
      });
    },
    [setViewport]
  );

  const onPointerUp = useCallback(() => {
    panRef.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomTo(viewport.scale * factor, e.clientX, e.clientY);
    },
    [viewport.scale, zoomTo]
  );

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    >
      {/* Dot grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--text-dim) 0.5px, transparent 0)",
          backgroundSize: "40px 40px",
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
        {cards.map((card) => (
          <div key={card.id} data-card>
            <Card card={card} />
          </div>
        ))}
      </div>
      {/* Edge info popup — rendered outside transform so it's not affected by pan/zoom */}
      <EdgeInfoPopup />
    </div>
  );
}
