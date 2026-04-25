"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import type { Card as CardData } from "@/lib/canvas/types";
import { getSession, getActiveSession } from "@/lib/stream/session";
import { downloadCard } from "@/lib/utils/download";
import { EpisodeBadge } from "./EpisodeBadge";
import { useEpisodeStore } from "@/lib/episodes/store";
import { StreamCockpit } from "./StreamCockpit";

/** Show right-click hint once per session on the first generated card. */
function useFirstCardHint(hasUrl: boolean): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!hasUrl) return;
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem("sb_ctx_hint")) return;
    sessionStorage.setItem("sb_ctx_hint", "1");
    setShow(true);
    const t = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(t);
  }, [hasUrl]);
  return show;
}

/** Spinner with elapsed timer + progress bar using measured + estimated latency. */
function GeneratingSpinner({ type, capability }: { type: string; capability?: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [measuredEta, setMeasuredEta] = useState<number | null>(null);
  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    // Try to load measured latency from model router stats
    if (capability) {
      import("@livepeer/creative-kit").then((kit) => {
        const stats = kit.getModelStats();
        const s = stats.get(capability);
        if (s && s.count >= 1) setMeasuredEta(Math.ceil(s.avgMs / 1000));
      }).catch(() => {});
    }
    return () => clearInterval(iv);
  }, [capability]);

  // Model-specific ETA: measured first, then hardcoded defaults
  const defaultEtaMap: Record<string, number> = {
    "flux-dev": 8, "flux-schnell": 4, "gpt-image": 12, "recraft-v4": 6,
    "nano-banana": 5, "gemini-image": 8, "seedream-5-lite": 6, "kontext-edit": 8,
    "seedance-i2v": 60, "seedance-i2v-fast": 30, "kling-i2v": 45, "veo-i2v": 40,
    "ltx-i2v": 25, "ltx-t2v": 30, "chatterbox-tts": 10, "music": 15,
  };
  const defaultEta = type === "video" ? 60 : type === "audio" ? 12 : 8;
  const eta = measuredEta || (capability ? (defaultEtaMap[capability] || defaultEta) : defaultEta);
  const pct = Math.min(elapsed / eta, 0.95);

  return (
    <div className="flex flex-col items-center gap-2 w-full px-6">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--text-muted)]" />
      <span className="font-mono text-[11px] text-[var(--text-dim)]">
        {elapsed}s{capability ? ` · ${capability}` : ""}{elapsed < eta ? ` · ~${eta - elapsed}s left` : " · almost done"}
      </span>
      {/* Progress bar */}
      <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-purple-500/60 transition-all duration-1000"
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** Prompt bar — editable prompt with regenerate button. */
function PromptBar({ card, cap, prompt, elapsed, colors }: {
  card: CardData; cap: string | undefined; prompt: string | undefined;
  elapsed: number | undefined; colors: { text: string };
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(prompt || "");
  const [regenerating, setRegenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editValue.length, editValue.length);
    }
  }, [editing, editValue.length]);

  const handleRegenerate = async (newPrompt: string) => {
    if (!newPrompt.trim() || regenerating) return;
    setRegenerating(true);
    setEditing(false);

    const canvas = useCanvasStore.getState();
    // Save the new prompt on the card
    canvas.updateCard(card.id, { prompt: newPrompt.trim(), error: undefined, url: undefined });

    try {
      const { executeTool } = await import("@/lib/tools/registry");
      await executeTool("create_media", {
        steps: [{
          action: card.type === "video" ? "animate" : "generate",
          prompt: newPrompt.trim(),
          model_override: card.capability || undefined,
          source_url: card.type === "video" ? undefined : undefined,
        }],
      });
    } catch {
      canvas.updateCard(card.id, { error: "Regeneration failed" });
    }
    setRegenerating(false);
  };

  return (
    <div
      style={{
        borderTop: `1px solid ${colors.text}33`,
        background: `${colors.text}0d`,
        padding: "6px 10px",
        fontSize: 10,
        color: "#c4b5fd",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontWeight: 600, color: colors.text }} title={card.routeReason || "auto-selected"}>
          {cap || "generate"}
          {card.routeReason && card.routeReason !== "auto" && (
            <span style={{ fontWeight: 400, fontSize: 8, color: "#a78bfa", marginLeft: 4 }}>({card.routeReason})</span>
          )}
        </span>
        <span style={{ color: "#34d399" }}>
          {elapsed ? `${(elapsed / 1000).toFixed(1)}s` : ""}
        </span>
      </div>

      {editing ? (
        /* Floating expanded editor — positioned above the card for comfortable editing */
        <div style={{
          position: "absolute", bottom: "100%", left: 0, right: 0,
          marginBottom: 4, zIndex: 100,
          background: "rgba(16,16,24,0.98)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(139,92,246,0.4)", borderRadius: 10,
          padding: 10, boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 4, fontWeight: 600 }}>
            Edit prompt — Enter to regenerate
          </div>
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              // Auto-resize
              const el = e.target;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 160) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRegenerate(editValue); }
              if (e.key === "Escape") { setEditing(false); setEditValue(prompt || ""); }
            }}
            rows={3}
            style={{
              width: "100%", resize: "none", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6, padding: "8px 10px", fontSize: 12, lineHeight: 1.5,
              background: "rgba(0,0,0,0.4)", color: "#e2e8f0", outline: "none",
              fontFamily: "inherit", minHeight: 60, maxHeight: 160,
            }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "space-between", marginTop: 6, alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#666" }}>Shift+Enter for newline</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => { setEditing(false); setEditValue(prompt || ""); }}
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#888", fontSize: 11, cursor: "pointer", padding: "4px 12px" }}
              >Cancel</button>
              <button
                onClick={() => handleRegenerate(editValue)}
                disabled={!editValue.trim() || regenerating}
                style={{
                  background: "rgba(139,92,246,0.3)", border: "none", borderRadius: 6,
                  color: "#c4b5fd", fontSize: 11, fontWeight: 600, cursor: "pointer",
                  padding: "4px 14px", opacity: !editValue.trim() ? 0.4 : 1,
                }}
              >{regenerating ? "Generating..." : "Regenerate"}</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
          <div
            style={{ flex: 1, color: "var(--text-muted)", fontSize: 9, lineHeight: 1.4, cursor: "pointer" }}
            title="Click to edit prompt, double-click to copy"
            onClick={(e) => { e.stopPropagation(); setEditValue(prompt || ""); setEditing(true); }}
            onDoubleClick={(e) => { e.stopPropagation(); if (prompt) navigator.clipboard.writeText(prompt); }}
          >
            {prompt ? (prompt.length > 100 ? prompt.slice(0, 100) + "\u2026" : prompt) : "No prompt"}
          </div>
          {prompt && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRegenerate(prompt); }}
              disabled={regenerating}
              title="Regenerate with same prompt"
              style={{
                flexShrink: 0, background: "rgba(139,92,246,0.2)", border: "none",
                borderRadius: 3, color: "#a78bfa", fontSize: 9, cursor: "pointer",
                padding: "1px 5px", opacity: regenerating ? 0.4 : 1,
              }}
            >{regenerating ? "..." : "↻"}</button>
          )}
        </div>
      )}
    </div>
  );
}

/** Editable card title — click to copy, double-click to rename. */
function EditableTitle({ title, onRename, onCopy }: { title: string; onRename: (t: string) => void; onCopy: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="card-controls min-w-0 flex-1 rounded border border-white/20 bg-white/10 px-1 text-[11px] font-medium text-[var(--text)] outline-none"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (value.trim() && value !== title) onRename(value.trim()); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { if (value.trim() && value !== title) onRename(value.trim()); setEditing(false); }
          if (e.key === "Escape") { setValue(title); setEditing(false); }
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className="card-controls min-w-0 flex-1 cursor-pointer truncate text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
      title="Click to copy · Double-click to rename"
      onClick={(e) => { e.stopPropagation(); onCopy(); }}
      onDoubleClick={(e) => { e.stopPropagation(); setValue(title); setEditing(true); }}
    >
      {title}
    </span>
  );
}

/** Caption banner with date + action highlighting and expand-on-click. */
function CaptionBanner({ caption }: { caption: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = caption.length > 100;

  // Split caption into lines, highlight dates (cyan) and actions (amber)
  const highlightText = (text: string) => {
    // Date patterns: Apr 16, 2026-04-16, April 26, Sunday, 5:30am, June 7th, etc.
    const dateRe = /\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*|\d{1,2}:\d{2}\s*(?:am|pm|AM|PM)?)\b/g;
    // Action patterns: review, respond, book, call, sign up, enroll, register, pay, update, join, RSVP
    const actionRe = /\b(review|respond|reply|book|call|sign up|enroll|register|pay|update|join|rsvp|renew|cancel|approve|submit|schedule|confirm|attend|download|upgrade)\b/gi;

    const parts: Array<{ text: string; type: "normal" | "date" | "action" }> = [];
    let last = 0;
    const combined = `(${dateRe.source})|(${actionRe.source})`;
    const re = new RegExp(combined, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push({ text: text.slice(last, m.index), type: "normal" });
      const isDate = m[1] !== undefined;
      parts.push({ text: m[0], type: isDate ? "date" : "action" });
      last = re.lastIndex;
    }
    if (last < text.length) parts.push({ text: text.slice(last), type: "normal" });
    if (parts.length === 0) parts.push({ text, type: "normal" });
    return parts;
  };

  const parts = highlightText(caption);
  const displayText = !expanded && isLong ? caption.slice(0, 100) : caption;
  const displayParts = !expanded && isLong ? highlightText(displayText) : parts;

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 px-2.5 pb-2 pt-5 ${isLong ? "cursor-pointer" : "pointer-events-none"}`}
      style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.88))" }}
      onClick={isLong ? (e) => { e.stopPropagation(); setExpanded(!expanded); } : undefined}
    >
      <p className="text-[12px] font-medium leading-snug text-white/95">
        {displayParts.map((p, i) =>
          p.type === "date" ? (
            <span key={i} className="font-bold text-cyan-300">{p.text}</span>
          ) : p.type === "action" ? (
            <span key={i} className="font-bold text-amber-300">{p.text}</span>
          ) : (
            <span key={i}>{p.text}</span>
          )
        )}
        {!expanded && isLong && <span className="text-white/50">… tap to expand</span>}
      </p>
    </div>
  );
}

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  image: { text: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
  video: { text: "#06b6d4", bg: "rgba(6,182,212,0.1)" },
  audio: { text: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  camera: { text: "#10b981", bg: "rgba(16,185,129,0.1)" },
  stream: { text: "#ec4899", bg: "rgba(236,72,153,0.1)" },
};

export function Card({ card }: { card: CardData }) {
  const { viewport, selectedCardIds, updateCard, removeCard, selectCard, toggleCardSelection, togglePin, edges, cards } =
    useCanvasStore();
  const showCtxHint = useFirstCardHint(!!card.url);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    /** Original positions of all selected cards (for group drag) */
    groupOrigins?: Array<{ id: string; x: number; y: number }>;
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

  // Auto-expand stream cards when streaming
  const streamSession = card.type === "stream" ? (getSession(card.refId) || getActiveSession()) : null;
  const isStreaming = !!streamSession && !streamSession.stopped;
  const expandedW = isStreaming ? 640 : card.w;
  // 640 (square frame) + 32 (title) + 50 (presets) + 80 (input) + 50 (chips) + 60 (feed) ≈ 920
  const expandedH = isStreaming ? 920 : card.h;

  // Pinned cards render at their screen-space snapshot (pinX/pinY) rather
  // than their canvas coords, because InfiniteCanvas lifts them out of the
  // pan/zoom transform div. Without this they'd render at e.g. left=5000 on
  // a fixed-position root and appear off-screen. pinScale lets us keep the
  // card visually the same size it was at pin time regardless of later zoom.
  const isPinnedDisplay = !!card.pinned && card.pinX !== undefined && card.pinY !== undefined;
  const pinScale = card.pinScale ?? 1;
  const displayLeft = isPinnedDisplay ? card.pinX! : card.x;
  const displayTop = isPinnedDisplay ? card.pinY! : card.y;
  const displayW = isPinnedDisplay ? expandedW * pinScale : expandedW;
  const displayH = isPinnedDisplay
    ? (card.minimized ? 36 : expandedH) * pinScale
    : (card.minimized ? 36 : expandedH);

  // Find incoming edge for this card (shows what transformation created it)
  const incomingEdge = edges.find((e) => e.toRefId === card.refId);
  const tooltipText = incomingEdge?.meta
    ? `${incomingEdge.meta.capability || "transform"}${incomingEdge.meta.elapsed ? ` (${(incomingEdge.meta.elapsed / 1000).toFixed(1)}s)` : ""}${incomingEdge.meta.prompt ? `\n${incomingEdge.meta.prompt.slice(0, 60)}` : ""}`
    : undefined;

  // --- Drag (supports group drag when multiple cards selected) ---
  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest(".card-controls")) return;
      e.stopPropagation();

      // Handle selection first
      if (e.ctrlKey || e.metaKey) {
        toggleCardSelection(card.id);
        return; // Don't start drag on toggle
      } else if (!selectedCardIds.has(card.id)) {
        selectCard(card.id);
      }

      // Capture origins for all selected cards (group drag)
      const currentSelection = useCanvasStore.getState().selectedCardIds;
      const allCards = useCanvasStore.getState().cards;
      const groupOrigins = currentSelection.size > 1
        ? allCards
            .filter((c) => currentSelection.has(c.id))
            .map((c) => ({ id: c.id, x: c.x, y: c.y }))
        : undefined;

      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: isPinnedDisplay ? card.pinX! : card.x,
        origY: isPinnedDisplay ? card.pinY! : card.y,
        groupOrigins,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [card.id, card.x, card.y, selectCard, toggleCardSelection, selectedCardIds]
  );

  const onDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const { startX, startY, origX, origY, groupOrigins } = dragRef.current;
      // Pinned cards live in screen space — no viewport scale divide, and
      // writes go to pinX/pinY. Unpinned cards live in canvas space —
      // delta scales with zoom, writes go to x/y.
      const dx = isPinnedDisplay ? e.clientX - startX : (e.clientX - startX) / viewport.scale;
      const dy = isPinnedDisplay ? e.clientY - startY : (e.clientY - startY) / viewport.scale;

      if (groupOrigins && groupOrigins.length > 1) {
        // Group drag — move all selected cards by the same delta
        for (const origin of groupOrigins) {
          updateCard(origin.id, {
            x: origin.x + dx,
            y: origin.y + dy,
          });
        }
      } else if (isPinnedDisplay) {
        updateCard(card.id, {
          pinX: origX + dx,
          pinY: origY + dy,
        });
      } else {
        updateCard(card.id, {
          x: origX + dx,
          y: origY + dy,
        });
      }
    },
    [card.id, viewport.scale, updateCard, isPinnedDisplay]
  );

  const onDragEnd = useCallback(() => {
    if (!dragRef.current) return;
    const wasDragged = dragRef.current.startX !== undefined;
    dragRef.current = null;
    if (!wasDragged) return;

    // Check if the card landed inside an episode's bounding box.
    // If so, offer to add it to that episode (unless it's already in one).
    const epStore = useEpisodeStore.getState();
    const currentEp = epStore.getEpisodeForCard(card.id);
    if (currentEp) return; // already in an episode

    const allCards = useCanvasStore.getState().cards;
    const freshCard = allCards.find((c) => c.id === card.id);
    if (!freshCard) return;
    const cx = freshCard.x + freshCard.w / 2;
    const cy = freshCard.y + freshCard.h / 2;

    for (const ep of epStore.episodes) {
      const epCards = allCards.filter((c) => ep.cardIds.includes(c.id));
      if (epCards.length === 0) continue;
      // Compute episode bounding box (matches EpisodeLabel.tsx logic)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of epCards) {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.w);
        maxY = Math.max(maxY, c.y + c.h);
      }
      const PAD = 20;
      if (cx >= minX - PAD && cx <= maxX + PAD && cy >= minY - PAD - 32 && cy <= maxY + PAD) {
        // Card center is inside this episode's area — dispatch event for the toast
        window.dispatchEvent(new CustomEvent("episode-drop-offer", {
          detail: { cardId: card.id, episodeId: ep.id, episodeName: ep.name },
        }));
        break;
      }
    }
  }, [card.id]);

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
      // w/h are canvas-space. For pinned cards the rendered size is
      // card.w * pinScale, so divide the screen delta by pinScale to keep
      // resize feeling 1:1 on screen. For unpinned, divide by viewport.scale.
      const denom = isPinnedDisplay ? pinScale : viewport.scale;
      updateCard(card.id, {
        w: Math.max(200, origW + (e.clientX - startX) / denom),
        h: Math.max(160, origH + (e.clientY - startY) / denom),
      });
    },
    [card.id, viewport.scale, updateCard, isPinnedDisplay, pinScale]
  );

  const onResizeEnd = useCallback(() => {
    resizeRef.current = null;
  }, []);

  return (
    <div
      className={`absolute flex flex-col overflow-hidden rounded-xl border bg-[var(--surface)] shadow-[var(--shadow)] transition-[box-shadow,border-color] ${
        isSelected ? "border-[#555] ring-1 ring-blue-400/30"
        : card.pinned ? "border-amber-500/40 ring-1 ring-amber-400/20"
        : "border-[var(--border)]"
      } ${card.minimized ? "!h-9 !min-h-0" : "min-h-[160px] min-w-[200px]"}`}
      style={{
        left: displayLeft,
        top: displayTop,
        width: displayW,
        height: card.minimized ? 36 : displayH,
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
        <EditableTitle
          title={card.title}
          onRename={(newTitle) => updateCard(card.id, { title: newTitle })}
          onCopy={() => window.dispatchEvent(new CustomEvent("chat-prefill", { detail: { text: card.title } }))}
        />
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
            className={`flex h-[22px] w-[22px] items-center justify-center rounded border-none bg-transparent text-xs transition-all hover:bg-white/[0.08] ${
              card.pinned ? "text-amber-400" : "text-[var(--text-dim)] hover:text-amber-400"
            }`}
            title={card.pinned ? "Unpin" : "Pin to screen"}
            onClick={() => togglePin(card.id)}
          >
            {card.pinned ? "\uD83D\uDCCC" : "\uD83D\uDCCC"}
          </button>
          {card.url && (
            <button
              className="flex h-[22px] w-[22px] items-center justify-center rounded border-none bg-transparent text-xs text-[var(--text-dim)] transition-all hover:bg-white/[0.08] hover:text-green-400"
              title="Save to file"
              onClick={() => downloadCard(card)}
            >
              ↓
            </button>
          )}
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
      {!card.minimized && card.type !== "stream" && (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-[var(--bg)]">
          {card.error ? (
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10 text-red-400 text-lg">!</div>
              <div className="font-mono text-[11px] text-red-400 leading-relaxed">{card.error}</div>
              {card.prompt && card.capability && (
                <button
                  className="mt-1 rounded bg-white/10 px-3 py-1 text-[11px] text-white hover:bg-white/20 transition-colors"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const canvas = useCanvasStore.getState();
                    canvas.updateCard(card.id, { error: undefined, url: undefined });
                    try {
                      const { executeTool } = await import("@/lib/tools/registry");
                      await executeTool("create_media", {
                        steps: [{ action: "generate", prompt: card.prompt, model_override: card.capability }],
                      });
                    } catch { /* card will show new error */ }
                  }}
                >
                  ↻ Retry
                </button>
              )}
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
              // Images AND streams — double-click opens lightbox overlay
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.url}
                alt={card.title}
                title={card.prompt ? `${card.prompt.slice(0, 200)}${card.prompt.length > 200 ? "…" : ""}` : card.title}
                className="h-full w-full object-contain cursor-zoom-in"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  // Create a fullscreen overlay — requestFullscreen doesn't work on <img>
                  const overlay = document.createElement("div");
                  overlay.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;cursor:zoom-out";
                  const img = document.createElement("img");
                  img.src = card.url!;
                  img.alt = card.title;
                  img.style.cssText = "max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px";
                  overlay.appendChild(img);
                  // Caption
                  if (card.prompt) {
                    const cap = document.createElement("div");
                    cap.style.cssText = "position:absolute;bottom:20px;left:50%;transform:translateX(-50%);max-width:600px;padding:8px 16px;background:rgba(0,0,0,0.7);border-radius:8px;color:#ccc;font-size:12px;text-align:center";
                    cap.textContent = card.prompt.slice(0, 200);
                    overlay.appendChild(cap);
                  }
                  // Model badge
                  if (card.capability) {
                    const badge = document.createElement("div");
                    badge.style.cssText = "position:absolute;top:20px;left:20px;padding:4px 10px;background:rgba(139,92,246,0.3);border-radius:6px;color:#c4b5fd;font-size:11px;font-weight:600";
                    badge.textContent = card.capability + (card.routeReason && card.routeReason !== "auto" ? ` (${card.routeReason})` : "");
                    overlay.appendChild(badge);
                  }
                  overlay.onclick = () => overlay.remove();
                  document.addEventListener("keydown", function esc(ev) { if (ev.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", esc); } });
                  document.body.appendChild(overlay);
                }}
              />
            )
          ) : (
            <GeneratingSpinner type={card.type} capability={card.capability} />
          )}
        </div>
      )}

      {/* Cover slide — full-card text overlay for briefing title cards.
          Renders like a PPT cover: centered title, subtitle, stats. */}
      {card.coverText && !card.minimized && card.url && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4 text-center"
          style={{ background: "rgba(0,0,0,0.65)" }}
        >
          <div className="text-[16px] font-bold leading-tight text-white tracking-wide">
            {card.coverText.title}
          </div>
          {card.coverText.subtitle && (
            <div className="mt-1.5 text-[11px] font-medium text-white/70">
              {card.coverText.subtitle}
            </div>
          )}
          {card.coverText.stats && (
            <div className="mt-3 rounded-full bg-white/15 px-3 py-1 text-[10px] font-semibold text-white/90">
              {card.coverText.stats}
            </div>
          )}
        </div>
      )}

      {/* Caption banner — floating overlay at the bottom of the card image.
          Used by daily briefing to show email summary text on each slide.
          Dates are highlighted in cyan, action words in amber. */}
      {card.caption && !card.coverText && !card.minimized && card.url && (
        <CaptionBanner caption={card.caption} />
      )}

      {/* First-card hint — right-click tooltip */}
      {showCtxHint && !card.minimized && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-purple-600 px-3 py-1 text-[10px] text-white shadow-lg animate-pulse z-50">
          Right-click for more options (restyle, animate, variations...)
        </div>
      )}

      {/* Model info bar — editable prompt + regenerate */}
      {isSelected && !card.minimized && (() => {
        const cap = card.capability || incomingEdge?.meta?.capability;
        const prompt = card.prompt || incomingEdge?.meta?.prompt;
        const elapsed = card.elapsed ?? incomingEdge?.meta?.elapsed;
        if (!cap && !prompt) return null;
        return (
          <PromptBar card={card} cap={cap} prompt={prompt} elapsed={elapsed} colors={colors} />
        );
      })()}

      {/* Stream Cockpit — replaces old cramped controls when streaming */}
      {card.type === "stream" && !card.minimized && (
        <StreamCockpit card={card} />
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
