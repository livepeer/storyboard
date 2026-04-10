"use client";

import { useCallback, useEffect, useRef } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { Card } from "./Card";
import { ArrowLayer } from "./ArrowEdge";
// EdgeInfoPopup is now inline in ArrowLayer (no separate component)

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
        {cards.map((card) => (
          <div key={card.id} data-card>
            <Card card={card} />
          </div>
        ))}
      </div>
      {/* Edge popup is inline in ArrowLayer */}
    </div>
  );
}
