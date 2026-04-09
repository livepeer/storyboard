"use client";

import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import type { ArrowEdge } from "@/lib/canvas/types";

/**
 * EdgeInfoPopup — shows on arrow click. Uses window event pattern
 * (same as ContextMenu) for maximum simplicity.
 */
export function EdgeInfoPopup() {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [edge, setEdge] = useState<ArrowEdge | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cards = useCanvasStore((s) => s.cards);

  // Listen for edge-click events
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setEdge(d.edge);
      setPos({ x: d.x + 12, y: d.y - 20 });
      setVisible(true);
    };
    window.addEventListener("edge-click", handler);
    return () => window.removeEventListener("edge-click", handler);
  }, []);

  // Dismiss on click outside (with delay, same as context menu)
  useEffect(() => {
    if (!visible) return;
    const dismiss = () => setVisible(false);
    const timer = setTimeout(() => {
      window.addEventListener("click", dismiss);
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", dismiss);
    };
  }, [visible]);

  if (!visible || !edge) return null;

  const m = edge.meta || {};
  const from = cards.find((c) => c.refId === edge.fromRefId);
  const to = cards.find((c) => c.refId === edge.toRefId);
  const elapsed = m.elapsed ? `${(m.elapsed / 1000).toFixed(1)}s` : "\u2014";

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 2500,
        width: 300,
        background: "rgba(16,16,16,0.97)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        backdropFilter: "blur(16px)",
        fontSize: 12,
        color: "var(--text-muted)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(139,92,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#c4b5fd", fontSize: 14 }}>
          {m.action === "animate" ? "\u25B6" : m.action === "tts" ? "\u266B" : "\u25A2"}
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "#c4b5fd", fontSize: 12 }}>{m.capability || "\u2014"}</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{m.action || "transform"}</div>
        </div>
      </div>

      {/* Flow */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderLeft: "3px solid #60a5fa", borderRadius: 4, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {from?.title || edge.fromRefId}
        </div>
        <span style={{ color: "var(--text-dim)" }}>{"\u2192"}</span>
        <div style={{ flex: 1, padding: "4px 8px", background: "rgba(255,255,255,0.03)", borderLeft: "3px solid #34d399", borderRadius: 4, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {to?.title || edge.toRefId}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", borderBottom: m.prompt ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
        <div style={{ flex: 1, padding: "8px 14px", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-dim)" }}>Model</div>
          <div style={{ marginTop: 2, fontWeight: 500, color: "#c4b5fd" }}>{m.capability || "\u2014"}</div>
        </div>
        <div style={{ flex: 1, padding: "8px 14px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-dim)" }}>Latency</div>
          <div style={{ marginTop: 2, fontWeight: 500, color: "#34d399" }}>{elapsed}</div>
        </div>
      </div>

      {/* Prompt */}
      {m.prompt && (
        <div style={{ padding: "8px 14px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-dim)" }}>Prompt</div>
          <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: "var(--text-muted)" }}>
            {m.prompt.length > 200 ? m.prompt.slice(0, 200) + "\u2026" : m.prompt}
          </div>
        </div>
      )}
    </div>
  );
}
