"use client";

import React, { useRef, useCallback, useEffect, type ReactNode } from "react";
import type { Viewport } from "../interfaces/artifact-store";

export interface InfiniteBoardProps {
  viewport: Viewport;
  onViewportChange: (v: Partial<Viewport>) => void;
  gridSize?: number;
  gridColor?: string;
  className?: string;
  children?: ReactNode;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function InfiniteBoard({
  viewport,
  onViewportChange,
  gridSize = 40,
  gridColor = "rgba(255,255,255,0.03)",
  className,
  children,
  onContextMenu,
}: InfiniteBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Store latest viewport/callback in refs so the wheel listener stays stable
  const vpRef = useRef(viewport);
  const cbRef = useRef(onViewportChange);
  vpRef.current = viewport;
  cbRef.current = onViewportChange;

  // Non-passive wheel listener (allows preventDefault to stop page scroll)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const vp = vpRef.current;
      const cb = cbRef.current;

      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(10, vp.scale * zoomFactor));
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const newX = cx - (cx - vp.x) * (newScale / vp.scale);
        const newY = cy - (cy - vp.y) * (newScale / vp.scale);
        cb({ scale: newScale, x: newX, y: newY });
      } else {
        cb({ x: vp.x - e.deltaX, y: vp.y - e.deltaY });
      }
    };

    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        isPanning.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      onViewportChange({ x: viewport.x + dx, y: viewport.y + dy });
    },
    [viewport, onViewportChange]
  );

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const scaledGrid = gridSize * viewport.scale;
  const dotRadius = Math.max(0.5, viewport.scale * 0.8);
  const bgOffsetX = viewport.x % scaledGrid;
  const bgOffsetY = viewport.y % scaledGrid;
  const patternId = "grid-dots";

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", width: "100%", height: "100%" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={onContextMenu}
    >
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <defs>
          <pattern id={patternId} x={bgOffsetX} y={bgOffsetY} width={scaledGrid} height={scaledGrid} patternUnits="userSpaceOnUse">
            <circle cx={scaledGrid / 2} cy={scaledGrid / 2} r={dotRadius} fill={gridColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>

      <div style={{
        position: "absolute", inset: 0,
        transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        transformOrigin: "0 0",
      }}>
        {children}
      </div>
    </div>
  );
}
