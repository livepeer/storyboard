import React from "react";
import type { Artifact, ArtifactEdge } from "../interfaces/artifact-store";

export interface EdgeLayerProps {
  artifacts: Artifact[];
  edges: ArtifactEdge[];
  className?: string;
}

export function EdgeLayer({ artifacts, edges, className }: EdgeLayerProps) {
  const byRefId = new Map(artifacts.map((a) => [a.refId, a]));

  return (
    <svg
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <defs>
        <marker
          id="ck-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="4"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.5)" />
        </marker>
      </defs>
      {edges.map((edge) => {
        const from = byRefId.get(edge.fromRefId);
        const to = byRefId.get(edge.toRefId);
        if (!from || !to) return null;

        // bottom-center of source → top-center of target
        const x1 = from.x + from.w / 2;
        const y1 = from.y + from.h;
        const x2 = to.x + to.w / 2;
        const y2 = to.y;

        // Cubic bezier with vertical handles
        const dy = Math.abs(y2 - y1) * 0.5;
        const d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;

        return (
          <path
            key={edge.id}
            d={d}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={1.5}
            fill="none"
            markerEnd="url(#ck-arrow)"
          />
        );
      })}
    </svg>
  );
}
