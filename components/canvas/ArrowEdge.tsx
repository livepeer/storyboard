"use client";

import { useCanvasStore } from "@/lib/canvas/store";

/**
 * ArrowLayer — SVG for drawing + invisible HTML divs for click targets.
 * This avoids all SVG pointer-events issues.
 */
export function ArrowLayer() {
  const { cards, edges, selectedEdgeIdx, selectEdge } = useCanvasStore();
  const cardByRef = new Map(cards.map((c) => [c.refId, c]));

  const edgeData = edges.map((edge, idx) => {
    const from = cardByRef.get(edge.fromRefId);
    const to = cardByRef.get(edge.toRefId);
    if (!from || !to) return null;

    const x1 = from.x + from.w;
    const y1 = from.y + (from.minimized ? 18 : from.h / 2);
    const x2 = to.x;
    const y2 = to.y + (to.minimized ? 18 : to.h / 2);
    const pull = Math.max(60, Math.abs(x2 - x1) * 0.4);
    const d = `M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const sel = selectedEdgeIdx === idx;

    return { edge, idx, d, midX, midY, sel };
  }).filter(Boolean) as Array<{ edge: typeof edges[0]; idx: number; d: string; midX: number; midY: number; sel: boolean }>;

  return (
    <>
      {/* SVG for drawing arrows only — no interaction */}
      <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.3)" />
          </marker>
        </defs>
        {edgeData.map(({ d, sel, idx }) => (
          <path
            key={idx}
            d={d}
            fill="none"
            stroke={sel ? "rgba(139,92,246,0.85)" : "rgba(255,255,255,0.2)"}
            strokeWidth={sel ? 3 : 2}
            strokeDasharray={sel ? "none" : "6 4"}
            markerEnd="url(#ah)"
            style={sel ? { filter: "drop-shadow(0 0 6px rgba(139,92,246,0.4))" } : undefined}
          />
        ))}
      </svg>

      {/* HTML click targets at edge midpoints — no SVG pointer-events needed */}
      {edgeData.map(({ edge, idx, midX, midY, sel }) => (
        <div
          key={`hit-${idx}`}
          onClick={(e) => {
            e.stopPropagation();
            if (sel) {
              selectEdge(-1);
            } else {
              selectEdge(idx);
              window.dispatchEvent(
                new CustomEvent("edge-click", {
                  detail: { idx, edge, x: e.clientX, y: e.clientY },
                })
              );
            }
          }}
          style={{
            position: "absolute",
            left: midX - 20,
            top: midY - 12,
            width: 40,
            height: 24,
            cursor: "pointer",
            borderRadius: 6,
            background: sel ? "rgba(139,92,246,0.15)" : "transparent",
            border: sel ? "1px solid rgba(139,92,246,0.3)" : "1px solid transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            color: sel ? "rgba(139,92,246,0.8)" : "rgba(255,255,255,0.3)",
            transition: "background 0.1s, border-color 0.1s",
            zIndex: 2,
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = "rgba(139,92,246,0.1)";
            (e.target as HTMLElement).style.borderColor = "rgba(139,92,246,0.3)";
            (e.target as HTMLElement).style.color = "rgba(139,92,246,0.8)";
          }}
          onMouseLeave={(e) => {
            if (!sel) {
              (e.target as HTMLElement).style.background = "transparent";
              (e.target as HTMLElement).style.borderColor = "transparent";
              (e.target as HTMLElement).style.color = "rgba(255,255,255,0.3)";
            }
          }}
          title={edge.meta?.capability ? `${edge.meta.capability}${edge.meta.prompt ? `: ${edge.meta.prompt.slice(0, 40)}` : ""}` : ""}
        >
          {edge.meta?.capability ? edge.meta.capability.slice(0, 8) : "\u2192"}
        </div>
      ))}
    </>
  );
}
