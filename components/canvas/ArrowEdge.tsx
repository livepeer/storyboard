"use client";

import { useRef } from "react";
import { useCanvasStore } from "@/lib/canvas/store";

/**
 * ArrowLayer — SVG arrows between cards, matching original storyboard exactly.
 * Uses CSS classes (.arrows-svg, .arrow-visible, .arrow-hit) defined in globals.css
 * with the same pointer-events pattern as the original.
 */
export function ArrowLayer() {
  const { cards, edges, selectedEdgeIdx, selectEdge } = useCanvasStore();
  const visibleRefs = useRef<Map<number, SVGPathElement>>(new Map());

  const cardByRef = new Map(cards.map((c) => [c.refId, c]));

  return (
    <svg className="arrows-svg absolute left-0 top-0 h-full w-full">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.25)" />
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
        const pull = Math.max(60, Math.abs(x2 - x1) * 0.4);
        const d = `M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`;

        const isSel = selectedEdgeIdx === idx;

        return (
          <g key={`${edge.fromRefId}-${edge.toRefId}`}>
            {/* Visible path */}
            <path
              ref={(el) => {
                if (el) visibleRefs.current.set(idx, el);
                else visibleRefs.current.delete(idx);
              }}
              d={d}
              markerEnd="url(#arrowhead)"
              className={`arrow-visible${isSel ? " arrow-selected" : ""}`}
            />
            {/* Hit area — wide invisible path for hover + click */}
            <path
              d={d}
              className="arrow-hit"
              onMouseEnter={() => {
                visibleRefs.current.get(idx)?.classList.add("arrow-hover");
              }}
              onMouseLeave={() => {
                visibleRefs.current.get(idx)?.classList.remove("arrow-hover");
              }}
              onClick={(e) => {
                e.stopPropagation();
                selectEdge(isSel ? -1 : idx);
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}
