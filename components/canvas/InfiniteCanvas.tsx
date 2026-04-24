"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useEpisodeStore } from "@/lib/episodes/store";
import { Card } from "./Card";
import { ArrowLayer } from "./ArrowEdge";
import { GroupButton } from "./GroupButton";
import { EpisodeLabels } from "./EpisodeLabel";

export function InfiniteCanvas() {
  const { viewport, cards, setViewport, zoomTo, selectCard, selectEdge, selectCards } =
    useCanvasStore();
  const panRef = useRef<{ startX: number; startY: number } | null>(null);
  const [lasso, setLasso] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; button: number } | null>(null);

  // Track whether this drag is a lasso (Shift held on pointer down)
  const isLassoDrag = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-card]")) return;

      pointerStartRef.current = { x: e.clientX, y: e.clientY, button: e.button };
      panRef.current = {
        startX: e.clientX - viewport.panX,
        startY: e.clientY - viewport.panY,
      };

      // Shift+drag = lasso select mode; plain drag = pan
      isLassoDrag.current = e.shiftKey && e.button === 0;

      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        selectCard(null);
      }
      selectEdge(-1);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [viewport.panX, viewport.panY, selectCard, selectEdge]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panRef.current || !pointerStartRef.current) return;

      // Shift+drag = lasso selection
      if (isLassoDrag.current) {
        const dx = e.clientX - pointerStartRef.current.x;
        const dy = e.clientY - pointerStartRef.current.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          const toCanvas = (sx: number, sy: number) => ({
            x: (sx - viewport.panX) / viewport.scale,
            y: (sy - viewport.panY) / viewport.scale,
          });
          const start = toCanvas(pointerStartRef.current.x, pointerStartRef.current.y);
          const end = toCanvas(e.clientX, e.clientY);
          setLasso({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
        }
        return;
      }

      // Plain drag = pan canvas
      setViewport({
        panX: e.clientX - panRef.current.startX,
        panY: e.clientY - panRef.current.startY,
      });
    },
    [setViewport, viewport.panX, viewport.panY, viewport.scale]
  );

  const onPointerUp = useCallback(() => {
    if (lasso) {
      const minX = Math.min(lasso.x1, lasso.x2);
      const maxX = Math.max(lasso.x1, lasso.x2);
      const minY = Math.min(lasso.y1, lasso.y2);
      const maxY = Math.max(lasso.y1, lasso.y2);

      const inside = cards.filter((c) => {
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
      });
      if (inside.length > 0) {
        selectCards(inside.map((c) => c.id));
      }
      setLasso(null);
    }
    panRef.current = null;
    pointerStartRef.current = null;
    isLassoDrag.current = false;
  }, [lasso, cards, selectCards]);

  // Wheel zoom — must use ref-based listener with { passive: false }
  // because React attaches wheel events as passive by default,
  // which makes e.preventDefault() fail and floods the console.
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomTo(viewportRef.current.scale * factor, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomTo]);

  // --- Canvas context menu (right-click on empty space) ---
  // Dispatches the same event pattern as Card.tsx so ContextMenu.tsx
  // handles BOTH card clicks and empty-space clicks in one place.
  const onCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-card]")) return;
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent("canvas-context-menu", {
          detail: { x: e.clientX, y: e.clientY },
        })
      );
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={onCanvasContextMenu}
    >
      {/* Dot grid — moves with pan/zoom to give sense of scale */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.12) 0.8px, transparent 0)",
          backgroundSize: `${40 * viewport.scale}px ${40 * viewport.scale}px`,
          backgroundPosition: `${viewport.panX}px ${viewport.panY}px`,
        }}
      />
      {/* Transformed canvas layer */}
      <div
        className="absolute origin-top-left will-change-transform"
        style={{
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.scale})`,
          width: "100%",
          height: "100%",
        }}
      >
        <EpisodeLabels />
        <ArrowLayer />
        {lasso && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-blue-400/60 bg-blue-400/10 rounded"
            style={{
              left: Math.min(lasso.x1, lasso.x2),
              top: Math.min(lasso.y1, lasso.y2),
              width: Math.abs(lasso.x2 - lasso.x1),
              height: Math.abs(lasso.y2 - lasso.y1),
            }}
          />
        )}
        {cards.filter((c) => !c.pinned).map((card) => (
          <div key={card.id} data-card>
            <Card card={card} />
          </div>
        ))}
      </div>

      {/* Pinned cards — fixed on screen, don't move with pan/zoom */}
      {cards.filter((c) => c.pinned).map((card) => (
        <div key={card.id} data-card className="absolute" style={{ zIndex: 20 }}>
          <Card card={card} />
        </div>
      ))}

      {/* Edge popup is inline in ArrowLayer */}
      <GroupButton />

      {/* Episode drop-offer toast */}
      <EpisodeDropToast />
    </div>
  );
}

/** Toast shown when a card is dragged into an episode's area. */
function EpisodeDropToast() {
  const [offer, setOffer] = useState<{
    cardId: string;
    episodeId: string;
    episodeName: string;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const lastOfferRef = useRef("");

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        cardId: string;
        episodeId: string;
        episodeName: string;
      };
      // Debounce: don't re-trigger for same card+episode
      const key = `${detail.cardId}:${detail.episodeId}`;
      if (key === lastOfferRef.current) return;
      lastOfferRef.current = key;
      setConfirmed(false);
      setOffer(detail);
    };
    window.addEventListener("episode-drop-offer", handler);
    return () => window.removeEventListener("episode-drop-offer", handler);
  }, []);

  const handleAdd = useCallback(() => {
    if (!offer) return;
    useEpisodeStore.getState().addCards(offer.episodeId, [offer.cardId]);
    setConfirmed(true);
    lastOfferRef.current = "";
    setTimeout(() => { setOffer(null); setConfirmed(false); }, 1500);
  }, [offer]);

  const handleDismiss = useCallback(() => {
    lastOfferRef.current = "";
    setOffer(null);
  }, []);

  if (!offer) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] flex items-center gap-3 rounded-xl border border-white/20 bg-[rgba(22,22,22,0.95)] px-4 py-2.5 shadow-2xl backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {confirmed ? (
        <span className="text-xs text-green-400">Added to {offer.episodeName}</span>
      ) : (
        <>
          <span className="text-xs text-[var(--text)]">
            Add to <span className="font-semibold text-blue-400">{offer.episodeName}</span>?
          </span>
          <button
            onClick={handleAdd}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-500/30"
          >
            Add
          </button>
          <button
            onClick={handleDismiss}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
          >
            No
          </button>
        </>
      )}
    </div>
  );
}
