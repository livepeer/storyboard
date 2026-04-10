"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCanvasStore } from "@/lib/canvas/store";

export function ArrowLayer() {
  const { cards, edges, selectedEdgeIdx, selectEdge } = useCanvasStore();
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const cardByRef = new Map(cards.map((c) => [c.refId, c]));

  // Dismiss popup on outside click
  useEffect(() => {
    if (selectedEdgeIdx < 0) return;
    const dismiss = (e: MouseEvent) => {
      if (popupRef.current?.contains(e.target as Node)) return;
      selectEdge(-1);
      setPopupPos(null);
    };
    const t = setTimeout(() => window.addEventListener("click", dismiss), 50);
    return () => { clearTimeout(t); window.removeEventListener("click", dismiss); };
  }, [selectedEdgeIdx, selectEdge]);

  const edgeData = edges.map((edge, idx) => {
    const from = cardByRef.get(edge.fromRefId);
    const to = cardByRef.get(edge.toRefId);
    if (!from || !to) return null;
    const x1 = from.x + from.w, y1 = from.y + from.h / 2;
    const x2 = to.x, y2 = to.y + to.h / 2;
    const pull = Math.max(60, Math.abs(x2 - x1) * 0.4);
    const d = `M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`;
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
    const isNarrative = edge.meta?.action === "sequence" || edge.meta?.capability === "narrative";
    return { edge, idx, d, midX, midY, from, to, isNarrative };
  }).filter(Boolean) as any[];

  const selEdge = selectedEdgeIdx >= 0 ? edges[selectedEdgeIdx] : null;
  const selFrom = selEdge ? cards.find(c => c.refId === selEdge.fromRefId) : null;
  const selTo = selEdge ? cards.find(c => c.refId === selEdge.toRefId) : null;
  const m = selEdge?.meta || {};

  return (
    <>
      {/* SVG arrows */}
      <svg style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="rgba(255,255,255,0.3)" />
          </marker>
          <marker id="ah-seq" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="rgba(96,165,250,0.4)" />
          </marker>
        </defs>
        {edgeData.map(({ d, idx, isNarrative }: any) => {
          const sel = selectedEdgeIdx === idx;
          if (isNarrative) {
            // Narrative/sequence: thin dotted blue line
            return (
              <path key={idx} d={d} fill="none"
                stroke={sel ? "rgba(96,165,250,0.8)" : "rgba(96,165,250,0.25)"}
                strokeWidth={sel ? 2 : 1}
                strokeDasharray="3 6"
                markerEnd="url(#ah-seq)"
                style={sel ? { filter: "drop-shadow(0 0 4px rgba(96,165,250,0.3))" } : undefined}
              />
            );
          }
          // Transformation: white dashed line (existing style)
          return (
            <path key={idx} d={d} fill="none"
              stroke={sel ? "rgba(139,92,246,0.85)" : "rgba(255,255,255,0.2)"}
              strokeWidth={sel ? 3 : 2}
              strokeDasharray={sel ? "none" : "6 4"}
              markerEnd="url(#ah)"
              style={sel ? { filter: "drop-shadow(0 0 6px rgba(139,92,246,0.4))" } : undefined}
            />
          );
        })}
      </svg>

      {/* Click targets at midpoints */}
      {edgeData.map(({ edge, idx, midX, midY, isNarrative }: any) => {
        const sel = selectedEdgeIdx === idx;
        const cap = edge.meta?.capability || "";
        const label = isNarrative
          ? `${edge.meta?.prompt || ""}` // Scene title for narrative
          : cap.slice(0, 8) || "\u2192";
        return (
          <div key={`h${idx}`}
            title={isNarrative
              ? `Sequence: ${edge.meta?.prompt || ""}`
              : `${cap}${edge.meta?.prompt ? `: ${edge.meta.prompt.slice(0, 50)}` : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (sel) { selectEdge(-1); setPopupPos(null); }
              else { selectEdge(idx); setPopupPos({ x: e.clientX + 12, y: e.clientY - 20 }); }
            }}
            style={{
              position: "absolute", left: midX - 24, top: midY - 10,
              width: isNarrative ? 20 : 48, height: 20,
              cursor: "pointer", borderRadius: isNarrative ? 10 : 4, zIndex: 2,
              background: sel
                ? (isNarrative ? "rgba(96,165,250,0.2)" : "rgba(139,92,246,0.2)")
                : (isNarrative ? "rgba(96,165,250,0.08)" : "rgba(0,0,0,0.4)"),
              border: `1px solid ${sel
                ? (isNarrative ? "rgba(96,165,250,0.4)" : "rgba(139,92,246,0.4)")
                : (isNarrative ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.1)")}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: isNarrative ? 7 : 8,
              color: sel
                ? (isNarrative ? "#93c5fd" : "#c4b5fd")
                : (isNarrative ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.4)"),
              fontFamily: "var(--font-mono)", letterSpacing: 0.5,
            }}
            onMouseEnter={e => {
              const el = e.target as HTMLElement;
              el.style.borderColor = isNarrative ? "rgba(96,165,250,0.4)" : "rgba(139,92,246,0.4)";
              el.style.color = isNarrative ? "#93c5fd" : "#c4b5fd";
            }}
            onMouseLeave={e => {
              if (selectedEdgeIdx !== idx) {
                const el = e.target as HTMLElement;
                el.style.borderColor = isNarrative ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.1)";
                el.style.color = isNarrative ? "rgba(96,165,250,0.5)" : "rgba(255,255,255,0.4)";
              }
            }}
          >
            {isNarrative ? "\u2192" : label}
          </div>
        );
      })}

      {/* Popup — portaled to body */}
      {selEdge && popupPos && typeof document !== "undefined" && createPortal(
        <div ref={popupRef} onClick={e => e.stopPropagation()}
          style={{
            position: "fixed", left: popupPos.x, top: popupPos.y, zIndex: 2500, width: 300,
            background: "rgba(16,16,16,0.97)", border: "1px solid var(--border)",
            borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.5)", backdropFilter: "blur(16px)",
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: m.action === "sequence" ? "rgba(96,165,250,0.15)" : "rgba(139,92,246,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: m.action === "sequence" ? "#93c5fd" : "#c4b5fd", fontSize: 14,
            }}>
              {m.action === "sequence" ? "\u2192" : m.action === "animate" ? "\u25B6" : m.action === "tts" ? "\u266B" : "\u25A2"}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: m.action === "sequence" ? "#93c5fd" : "#c4b5fd", fontSize: 12 }}>
                {m.action === "sequence" ? "Narrative Sequence" : m.capability || "\u2014"}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{m.action || "transform"}</div>
            </div>
          </div>
          <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--text-muted)" }}>
            <div style={{ flex: 1, padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderLeft: "3px solid #60a5fa", borderRadius: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selFrom?.title || selEdge.fromRefId}
            </div>
            <span style={{ color: "var(--text-dim)" }}>{"\u2192"}</span>
            <div style={{ flex: 1, padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderLeft: "3px solid #34d399", borderRadius: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selTo?.title || selEdge.toRefId}
            </div>
          </div>
          {m.action !== "sequence" && (
            <div style={{ display: "flex", borderBottom: m.prompt ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <div style={{ flex: 1, padding: "8px 14px", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-dim)" }}>Model</div>
                <div style={{ marginTop: 2, fontWeight: 500, color: "#c4b5fd", fontSize: 12 }}>{m.capability || "\u2014"}</div>
              </div>
              <div style={{ flex: 1, padding: "8px 14px" }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-dim)" }}>Latency</div>
                <div style={{ marginTop: 2, fontWeight: 500, color: "#34d399", fontSize: 12 }}>{m.elapsed ? `${(m.elapsed / 1000).toFixed(1)}s` : "\u2014"}</div>
              </div>
            </div>
          )}
          {m.prompt && (
            <div style={{ padding: "8px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-dim)" }}>
                {m.action === "sequence" ? "Scene" : "Prompt"}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: "var(--text-muted)" }}>
                {m.prompt.length > 200 ? m.prompt.slice(0, 200) + "\u2026" : m.prompt}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
