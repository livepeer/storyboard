"use client";

import { useCallback, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import type { Card as CardData } from "@/lib/canvas/types";
import { getSession, getActiveSession, controlStream } from "@/lib/stream/session";

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  image: { text: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  video: { text: "#06b6d4", bg: "rgba(6,182,212,0.1)" },
  audio: { text: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  camera: { text: "#10b981", bg: "rgba(16,185,129,0.1)" },
  stream: { text: "#ec4899", bg: "rgba(236,72,153,0.1)" },
};

export function Card({ card }: { card: CardData }) {
  const { viewport, selectedCardId, updateCard, removeCard, selectCard, edges } =
    useCanvasStore();
  const [streamInput, setStreamInput] = useState("");
  const [streamMsg, setStreamMsg] = useState("");
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const isSelected = selectedCardId === card.id;
  const colors = TYPE_COLORS[card.type] || TYPE_COLORS.image;

  // Find incoming edge for this card (shows what transformation created it)
  const incomingEdge = edges.find((e) => e.toRefId === card.refId);
  const tooltipText = incomingEdge?.meta
    ? `${incomingEdge.meta.capability || "transform"}${incomingEdge.meta.elapsed ? ` (${(incomingEdge.meta.elapsed / 1000).toFixed(1)}s)` : ""}${incomingEdge.meta.prompt ? `\n${incomingEdge.meta.prompt.slice(0, 60)}` : ""}`
    : undefined;

  // --- Drag ---
  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest(".card-controls")) return;
      e.stopPropagation();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: card.x,
        origY: card.y,
      };
      selectCard(card.id);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [card.id, card.x, card.y, selectCard]
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const { startX, startY, origX, origY } = dragRef.current;
      updateCard(card.id, {
        x: origX + (e.clientX - startX) / viewport.scale,
        y: origY + (e.clientY - startY) / viewport.scale,
      });
    },
    [card.id, viewport.scale, updateCard]
  );

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  // --- Resize ---
  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: card.w,
        origH: card.h,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [card.w, card.h]
  );

  const onResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return;
      const { startX, startY, origW, origH } = resizeRef.current;
      updateCard(card.id, {
        w: Math.max(200, origW + (e.clientX - startX) / viewport.scale),
        h: Math.max(160, origH + (e.clientY - startY) / viewport.scale),
      });
    },
    [card.id, viewport.scale, updateCard]
  );

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null;
  }, []);

  return (
    <div
      className={`absolute flex flex-col overflow-hidden rounded-xl border bg-[var(--surface)] shadow-[var(--shadow)] transition-[box-shadow,border-color] ${
        isSelected ? "border-[#555]" : "border-[var(--border)]"
      } ${card.minimized ? "!h-9 !min-h-0" : "min-h-[160px] min-w-[200px]"}`}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.minimized ? 36 : card.h,
      }}
      onPointerDown={() => selectCard(card.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("card-context-menu", {
            detail: { card, x: e.clientX, y: e.clientY },
          })
        );
      }}
    >
      {/* Header */}
      <div
        className="flex h-9 shrink-0 cursor-grab items-center gap-2 border-b border-[var(--border)] bg-white/[0.02] px-2.5 active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: colors.text, background: colors.bg }}
        >
          {card.type}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--text-muted)]">
          {card.title}
        </span>
        <span className="shrink-0 truncate rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-[#aaa]">
          {card.refId}
        </span>
        <div className="card-controls flex shrink-0 gap-0.5">
          <button
            className="flex h-[22px] w-[22px] items-center justify-center rounded border-none bg-transparent text-xs text-[var(--text-dim)] transition-all hover:bg-white/[0.08] hover:text-[var(--text-muted)]"
            onClick={() => updateCard(card.id, { minimized: !card.minimized })}
          >
            {card.minimized ? "□" : "—"}
          </button>
          <button
            className="flex h-[22px] w-[22px] items-center justify-center rounded border-none bg-transparent text-xs text-[var(--text-dim)] transition-all hover:bg-white/[0.08] hover:text-red-500"
            onClick={() => removeCard(card.id)}
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      {!card.minimized && (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--bg)]">
          {card.error ? (
            <div className="p-4 text-center font-mono text-[11px] text-red-500">
              {card.error}
            </div>
          ) : card.url ? (
            card.type === "audio" ? (
              <audio src={card.url} controls className="mx-3 h-10 w-[calc(100%-24px)]" />
            ) : card.type === "video" ? (
              <video
                src={card.url}
                controls
                className="h-full w-full object-contain"
              />
            ) : (
              // Images AND streams use <img> — LV2V streams are JPEG frames, not video URLs
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.url} alt={card.title} className="h-full w-full object-contain" />
            )
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--text-muted)]" />
              <span className="font-mono text-[11px] text-[var(--text-dim)]">
                Generating…
              </span>
            </div>
          )}
        </div>
      )}

      {/* Model info bar — shows when card is selected and has an incoming transformation */}
      {isSelected && incomingEdge?.meta && !card.minimized && (
        <div style={{
          borderTop: "1px solid rgba(139,92,246,0.3)",
          background: "rgba(139,92,246,0.08)",
          padding: "6px 10px",
          fontSize: 10,
          color: "#c4b5fd",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontWeight: 600 }}>{incomingEdge.meta.capability || "transform"}</span>
            <span style={{ color: "#34d399" }}>
              {incomingEdge.meta.elapsed ? `${(incomingEdge.meta.elapsed / 1000).toFixed(1)}s` : ""}
            </span>
          </div>
          {incomingEdge.meta.prompt && (
            <div style={{ color: "var(--text-muted)", fontSize: 9, lineHeight: 1.4 }}>
              {incomingEdge.meta.prompt.length > 80 ? incomingEdge.meta.prompt.slice(0, 80) + "\u2026" : incomingEdge.meta.prompt}
            </div>
          )}
        </div>
      )}

      {/* Stream controls — run/stop, status, inline agent */}
      {card.type === "stream" && !card.minimized && (
        <div style={{
          borderTop: "1px solid rgba(236,72,153,0.2)",
          background: "rgba(236,72,153,0.05)",
          padding: "4px 8px",
          fontSize: 10,
        }}>
          {/* Run/Stop + Status bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <button
              className="card-controls"
              style={{
                background: "rgba(236,72,153,0.2)",
                border: "1px solid rgba(236,72,153,0.3)",
                borderRadius: 4,
                color: "#ec4899",
                padding: "2px 8px",
                fontSize: 10,
                cursor: "pointer",
              }}
              onClick={() => {
                const session = getSession(card.refId) || getActiveSession();
                if (session) {
                  // Toggle publishing
                  if (session.stopped) {
                    window.dispatchEvent(new CustomEvent("lv2v-resume", { detail: { streamId: session.streamId } }));
                  } else {
                    window.dispatchEvent(new CustomEvent("lv2v-pause", { detail: { streamId: session.streamId } }));
                  }
                }
              }}
            >
              {(() => {
                const session = getSession(card.refId) || getActiveSession();
                return session && !session.stopped ? "Stop" : "Start";
              })()}
            </button>
            <span style={{ color: "var(--text-dim)", flex: 1 }}>
              {(() => {
                const session = getSession(card.refId) || getActiveSession();
                if (!session) return "No active stream";
                if (session.stopped) return "Stopped";
                return `pub:${session.publishOk} recv:${session.totalRecv}`;
              })()}
            </span>
          </div>

          {/* Inline Scope agent input */}
          <div style={{ display: "flex", gap: 4 }}>
            <input
              className="card-controls"
              type="text"
              placeholder="Type to control stream..."
              value={streamInput}
              onChange={(e) => setStreamInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== "Enter" || !streamInput.trim()) return;
                const session = getSession(card.refId) || getActiveSession();
                if (!session) {
                  setStreamMsg("No active stream");
                  return;
                }
                try {
                  await controlStream(session, streamInput.trim());
                  setStreamMsg(`Updated: prompt`);
                  setStreamInput("");
                } catch (err) {
                  setStreamMsg(`Error: ${err}`);
                }
              }}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 10,
                color: "var(--text-muted)",
                outline: "none",
              }}
            />
          </div>
          {streamMsg && (
            <div style={{ color: "#34d399", fontSize: 9, marginTop: 2 }}>{streamMsg}</div>
          )}
        </div>
      )}

      {/* Video controls enhancement */}
      {card.type === "video" && card.url && !card.minimized && (
        <div style={{
          borderTop: "1px solid rgba(6,182,212,0.2)",
          background: "rgba(6,182,212,0.05)",
          padding: "2px 8px",
          fontSize: 9,
          color: "var(--text-dim)",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>Video</span>
          <button
            className="card-controls"
            style={{ background: "none", border: "none", color: "#06b6d4", cursor: "pointer", fontSize: 9 }}
            onClick={() => {
              const video = document.querySelector(`video[src="${card.url}"]`) as HTMLVideoElement;
              if (video) video.requestFullscreen?.();
            }}
          >
            Fullscreen
          </button>
        </div>
      )}

      {/* Resize handle */}
      {!card.minimized && (
        <div
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
        >
          <div className="absolute bottom-1 right-1 h-2 w-2 border-b-2 border-r-2 border-[var(--text-dim)]" />
        </div>
      )}
    </div>
  );
}
