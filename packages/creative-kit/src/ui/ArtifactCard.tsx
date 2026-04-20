"use client";

import React, { useRef, useCallback, type ReactNode } from "react";
import type { Artifact } from "../interfaces/artifact-store";

export interface ArtifactCardProps {
  artifact: Artifact;
  selected?: boolean;
  viewportScale?: number;
  onMove?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, w: number, h: number) => void;
  onSelect?: (id: string) => void;
  children?: ReactNode;
  className?: string;
}

export function ArtifactCard({
  artifact,
  selected = false,
  viewportScale = 1,
  onMove,
  onResize,
  onSelect,
  children,
  className,
}: ArtifactCardProps) {
  const dragStart = useRef<{ mx: number; my: number; ax: number; ay: number } | null>(null);
  const resizeStart = useRef<{ mx: number; my: number; w: number; h: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onSelect?.(artifact.id);
      dragStart.current = { mx: e.clientX, my: e.clientY, ax: artifact.x, ay: artifact.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [artifact.id, artifact.x, artifact.y, onSelect]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragStart.current) {
        const dx = (e.clientX - dragStart.current.mx) / viewportScale;
        const dy = (e.clientY - dragStart.current.my) / viewportScale;
        onMove?.(artifact.id, dragStart.current.ax + dx, dragStart.current.ay + dy);
      }
    },
    [artifact.id, viewportScale, onMove]
  );

  const handlePointerUp = useCallback(() => {
    dragStart.current = null;
  }, []);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      resizeStart.current = { mx: e.clientX, my: e.clientY, w: artifact.w, h: artifact.h };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [artifact.w, artifact.h]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeStart.current) return;
      const dx = (e.clientX - resizeStart.current.mx) / viewportScale;
      const dy = (e.clientY - resizeStart.current.my) / viewportScale;
      onResize?.(
        artifact.id,
        Math.max(80, resizeStart.current.w + dx),
        Math.max(60, resizeStart.current.h + dy)
      );
    },
    [artifact.id, viewportScale, onResize]
  );

  const handleResizePointerUp = useCallback(() => {
    resizeStart.current = null;
  }, []);

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: artifact.x,
        top: artifact.y,
        width: artifact.w,
        height: artifact.h,
        boxSizing: "border-box",
        border: selected ? "2px solid #3b82f6" : "2px solid transparent",
        boxShadow: selected ? "0 0 0 2px rgba(59,130,246,0.3)" : "none",
        borderRadius: 6,
        cursor: dragStart.current ? "grabbing" : "grab",
        userSelect: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {children}

      {/* Bottom-right resize handle */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: 14,
          height: 14,
          cursor: "se-resize",
          background: selected ? "#3b82f6" : "rgba(255,255,255,0.2)",
          borderRadius: "3px 0 4px 0",
        }}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
      />
    </div>
  );
}
