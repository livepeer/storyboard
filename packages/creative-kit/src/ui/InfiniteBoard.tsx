"use client";

import React, { useRef, useCallback, type ReactNode } from "react";
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
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(10, viewport.scale * zoomFactor));
        // Zoom toward cursor
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const newX = cx - (cx - viewport.x) * (newScale / viewport.scale);
        const newY = cy - (cy - viewport.y) * (newScale / viewport.scale);
        onViewportChange({ scale: newScale, x: newX, y: newY });
      } else {
        // Pan
        onViewportChange({ x: viewport.x - e.deltaX, y: viewport.y - e.deltaY });
      }
    },
    [viewport, onViewportChange]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Alt+click or middle-click = pan
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

  // Scaled grid dot size and spacing
  const scaledGrid = gridSize * viewport.scale;
  const dotRadius = Math.max(0.5, viewport.scale * 0.8);
  const bgOffsetX = viewport.x % scaledGrid;
  const bgOffsetY = viewport.y % scaledGrid;

  const patternId = "grid-dots";

  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden", width: "100%", height: "100%" }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={onContextMenu}
    >
      {/* Dot grid background */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <defs>
          <pattern
            id={patternId}
            x={bgOffsetX}
            y={bgOffsetY}
            width={scaledGrid}
            height={scaledGrid}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={scaledGrid / 2} cy={scaledGrid / 2} r={dotRadius} fill={gridColor} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>

      {/* Transform layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {children}
      </div>
    </div>
  );
}
