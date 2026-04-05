"use client";

import { useCanvasStore } from "@/lib/canvas/store";

export function ArrowLayer() {
  const { cards, edges, selectedEdgeIdx, selectEdge } = useCanvasStore();

  const cardByRef = new Map(cards.map((c) => [c.refId, c]));

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible"
      style={{ zIndex: 0 }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="8"
          refY="3"
          orient="auto"
        >
          <polygon
            points="0 0, 8 3, 0 6"
            fill="rgba(255,255,255,0.25)"
          />
        </marker>
      </defs>
      {edges.map((edge, idx) => {
        const from = cardByRef.get(edge.fromRefId);
        const to = cardByRef.get(edge.toRefId);
        if (!from || !to) return null;
        if (from.minimized && to.minimized) return null;

        const x1 = from.x + from.w;
        const y1 = from.y + (from.minimized ? 18 : from.h / 2);
        const x2 = to.x;
        const y2 = to.y + (to.minimized ? 18 : to.h / 2);

        const dx = x2 - x1;
        const pull = Math.max(60, Math.abs(dx) * 0.4);
        const d = `M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`;

        const isSelected = selectedEdgeIdx === idx;

        return (
          <g key={`${edge.fromRefId}-${edge.toRefId}`}>
            {/* Hit area — wide invisible path for click/hover */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={24}
              className="pointer-events-stroke cursor-pointer"
              onClick={() => selectEdge(idx)}
            />
            {/* Visible path */}
            <path
              d={d}
              fill="none"
              stroke={
                isSelected
                  ? "rgba(139,92,246,0.85)"
                  : "rgba(255,255,255,0.18)"
              }
              strokeWidth={isSelected ? 3 : 2}
              strokeDasharray={isSelected ? "none" : "6 4"}
              markerEnd="url(#arrowhead)"
              className="pointer-events-none transition-[stroke,stroke-width] duration-75"
              style={
                isSelected
                  ? { filter: "drop-shadow(0 0 6px rgba(139,92,246,0.4))" }
                  : undefined
              }
            />
          </g>
        );
      })}
    </svg>
  );
}
