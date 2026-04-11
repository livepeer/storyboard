"use client";

import { useCallback, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import type { Card as CardData } from "@/lib/canvas/types";
import { getSession, getActiveSession, controlStream } from "@/lib/stream/session";
import { EpisodeBadge } from "./EpisodeBadge";
import { useEpisodeStore } from "@/lib/episodes/store";

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  image: { text: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  video: { text: "#06b6d4", bg: "rgba(6,182,212,0.1)" },
  audio: { text: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  camera: { text: "#10b981", bg: "rgba(16,185,129,0.1)" },
  stream: { text: "#ec4899", bg: "rgba(236,72,153,0.1)" },
};

export function Card({ card }: { card: CardData }) {
  const { viewport, selectedCardIds, updateCard, removeCard, selectCard, toggleCardSelection, edges } =
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

  const isSelected = selectedCardIds.has(card.id);
  const colors = TYPE_COLORS[card.type] || TYPE_COLORS.image;
  const episode = useEpisodeStore((s) => s.getEpisodeForCard(card.id));
  const isActiveEpisode = episode?.id === useEpisodeStore((s) => s.activeEpisodeId);

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
      if (e.ctrlKey || e.metaKey) {
        toggleCardSelection(card.id);
      } else if (!selectedCardIds.has(card.id)) {
        selectCard(card.id);
      }
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [card.id, card.x, card.y, selectCard, toggleCardSelection, selectedCardIds]
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
        isSelected ? "border-[#555] ring-1 ring-blue-400/30" : "border-[var(--border)]"
      } ${card.minimized ? "!h-9 !min-h-0" : "min-h-[160px] min-w-[200px]"}`}
      style={{
        left: card.x,
        top: card.y,
        width: card.w,
        height: card.minimized ? 36 : card.h,
        borderLeftWidth: isActiveEpisode ? 3 : undefined,
        borderLeftColor: isActiveEpisode ? episode?.color : undefined,
      }}
      onPointerDown={(e) => {
        if (e.ctrlKey || e.metaKey) {
          toggleCardSelection(card.id);
        } else if (!selectedCardIds.has(card.id)) {
          selectCard(card.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("card-context-menu", {
            detail: { card, x: e.clientX, y: e.clientY },
          })
        );
      }}
    >
      <EpisodeBadge cardId={card.id} />

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
        <span
          className="card-controls min-w-0 flex-1 cursor-pointer truncate text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          title={`Click to copy "${card.title}" to chat`}
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("chat-prefill", { detail: { text: card.title } }));
          }}
        >
          {card.title}
        </span>
        <span
          className="card-controls shrink-0 cursor-pointer truncate rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-[#aaa] transition-colors hover:bg-white/[0.15] hover:text-white"
          title={`Click to copy "${card.refId}" to chat`}
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("chat-prefill", { detail: { text: card.refId } }));
          }}
        >
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
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-400 text-lg">!</div>
              <div className="font-mono text-[11px] text-red-400 leading-relaxed">{card.error}</div>
              <div className="text-[9px] text-[var(--text-dim)]">Right-click for options</div>
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

      {/* Model info bar — shows when card is selected; uses card metadata or incoming edge */}
      {isSelected && !card.minimized && (() => {
        const cap = card.capability || incomingEdge?.meta?.capability;
        const prompt = card.prompt || incomingEdge?.meta?.prompt;
        const elapsed = card.elapsed ?? incomingEdge?.meta?.elapsed;
        if (!cap && !prompt) return null;
        return (
          <div style={{
            borderTop: `1px solid ${colors.text}33`,
            background: `${colors.text}0d`,
            padding: "6px 10px",
            fontSize: 10,
            color: "#c4b5fd",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: prompt ? 2 : 0 }}>
              <span style={{ fontWeight: 600, color: colors.text }}>{cap || "generate"}</span>
              <span style={{ color: "#34d399" }}>
                {elapsed ? `${(elapsed / 1000).toFixed(1)}s` : ""}
              </span>
            </div>
            {prompt && (
              <div
                style={{ color: "var(--text-muted)", fontSize: 9, lineHeight: 1.4, cursor: "pointer" }}
                title="Click to copy prompt"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(prompt);
                }}
              >
                {prompt.length > 120 ? prompt.slice(0, 120) + "\u2026" : prompt}
              </div>
            )}
          </div>
        );
      })()}

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
