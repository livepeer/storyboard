"use client";

import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/lib/canvas/store";

export function EdgeInfoPopup() {
  const { edges, cards, selectedEdgeIdx, selectEdge } = useCanvasStore();
  const popupRef = useRef<HTMLDivElement>(null);

  const edge = selectedEdgeIdx >= 0 ? edges[selectedEdgeIdx] : null;
  const fromCard = edge ? cards.find((c) => c.refId === edge.fromRefId) : null;
  const toCard = edge ? cards.find((c) => c.refId === edge.toRefId) : null;

  // Dismiss on click outside
  useEffect(() => {
    if (!edge) return;
    const dismiss = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        selectEdge(-1);
      }
    };
    const timer = setTimeout(() => window.addEventListener("click", dismiss), 10);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", dismiss);
    };
  }, [edge, selectEdge]);

  if (!edge || !fromCard || !toCard) return null;

  const m = edge.meta || {};
  const elapsed = m.elapsed ? `${(m.elapsed / 1000).toFixed(1)}s` : "\u2014";
  const capability = m.capability || "\u2014";
  const action = m.action || "transform";
  const prompt = m.prompt || "";

  // Position near the midpoint of the edge
  const midX = (fromCard.x + fromCard.w + toCard.x) / 2;
  const midY = (fromCard.y + fromCard.h / 2 + toCard.y + toCard.h / 2) / 2;

  return (
    <div
      ref={popupRef}
      className="absolute z-[2000] w-[320px] overflow-hidden rounded-xl border border-[var(--border)] bg-[rgba(16,16,16,0.97)] shadow-[var(--shadow-lg)] backdrop-blur-xl"
      style={{ left: midX + 20, top: midY - 60 }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header: icon + capability + type */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-sm text-purple-300">
          {action === "animate" ? "\u25B6" : action === "tts" ? "\u266B" : "\u25A2"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-purple-300">{capability}</div>
          <div className="text-[10px] text-[var(--text-dim)]">{action}</div>
        </div>
      </div>

      {/* Flow: from → to */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="min-w-0 flex-1 truncate rounded-md border-l-[3px] border-blue-400 bg-white/[0.03] px-2 py-1 text-[10px] text-[var(--text-muted)]">
          {fromCard.title}
        </div>
        <span className="text-[var(--text-dim)]">{"\u27F6"}</span>
        <div className="min-w-0 flex-1 truncate rounded-md border-l-[3px] border-emerald-400 bg-white/[0.03] px-2 py-1 text-[10px] text-[var(--text-muted)]">
          {toCard.title}
        </div>
      </div>

      {/* Stats: model + latency */}
      <div className="flex border-b border-white/[0.06]">
        <div className="flex-1 border-r border-white/[0.06] px-4 py-2.5">
          <div className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-dim)]">Model</div>
          <div className="mt-0.5 text-xs font-medium text-purple-300">{capability}</div>
        </div>
        <div className="flex-1 px-4 py-2.5">
          <div className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-dim)]">Latency</div>
          <div className="mt-0.5 text-xs font-medium text-emerald-400">{elapsed}</div>
        </div>
      </div>

      {/* Prompt */}
      {prompt && (
        <div className="border-b border-white/[0.06] px-4 py-2.5">
          <div className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-dim)]">Prompt</div>
          <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {prompt.length > 200 ? prompt.slice(0, 200) + "\u2026" : prompt}
          </div>
        </div>
      )}
    </div>
  );
}
