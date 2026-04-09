"use client";

import { useCanvasStore } from "@/lib/canvas/store";

/**
 * ArrowLayer — simplest possible implementation.
 * Click dispatches a window event (same pattern as context menu).
 */
export function ArrowLayer() {
  const { cards, edges, selectedEdgeIdx, selectEdge } = useCanvasStore();
  const cardByRef = new Map(cards.map((c) => [c.refId, c]));

  return (
    <svg
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}
    >
      <defs>
        <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.3)" />
        </marker>
      </defs>
      {edges.map((edge, idx) => {
        const from = cardByRef.get(edge.fromRefId);
        const to = cardByRef.get(edge.toRefId);
        if (!from || !to) return null;

        const x1 = from.x + from.w;
        const y1 = from.y + (from.minimized ? 18 : from.h / 2);
        const x2 = to.x;
        const y2 = to.y + (to.minimized ? 18 : to.h / 2);
        const pull = Math.max(60, Math.abs(x2 - x1) * 0.4);
        const d = `M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`;
        const sel = selectedEdgeIdx === idx;

        return (
          <g key={idx}>
            {/* Visible arrow */}
            <path
              d={d}
              fill="none"
              stroke={sel ? "rgba(139,92,246,0.85)" : "rgba(255,255,255,0.2)"}
              strokeWidth={sel ? 3 : 2}
              strokeDasharray={sel ? "none" : "6 4"}
              markerEnd="url(#ah)"
              style={{ pointerEvents: "none", filter: sel ? "drop-shadow(0 0 6px rgba(139,92,246,0.4))" : "none" }}
            />
            {/* Hit area */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={20}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                if (sel) {
                  selectEdge(-1);
                } else {
                  selectEdge(idx);
                  // Dispatch event for popup (same pattern as context menu)
                  window.dispatchEvent(
                    new CustomEvent("edge-click", {
                      detail: { idx, edge, x: e.clientX, y: e.clientY },
                    })
                  );
                }
              }}
            />
          </g>
        );
      })}
    </svg>
  );
}
