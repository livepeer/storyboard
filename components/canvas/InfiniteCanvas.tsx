"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
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
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number } | null>(null);

  const onCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Only fire on empty canvas, not on cards
      if ((e.target as HTMLElement).closest("[data-card]")) return;
      e.preventDefault();
      setCanvasMenu({ x: e.clientX, y: e.clientY });
    },
    []
  );

  const canvasMenuRef = useRef<HTMLDivElement>(null);

  // Import dialog state
  const [importDialog, setImportDialog] = useState<{
    type: "image" | "video";
    mode: "file" | "url";
    previewUrl?: string;
    fileName?: string;
    urlInput?: string;
    file?: File;
  } | null>(null);

  const openImportDialog = useCallback((type: "image" | "video", mode: "file" | "url") => {
    console.log(`[Import] openImportDialog called: type=${type} mode=${mode}`);
    if (mode === "file") {
      // Open file picker SYNCHRONOUSLY in the click handler (user activation).
      // Close the menu AFTER input.click() so the user-activation context is preserved.
      const input = document.createElement("input");
      input.type = "file";
      input.accept = type === "image" ? "image/*" : "video/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setImportDialog({ type, mode: "file", previewUrl: url, fileName: file.name, file });
      };
      input.click();
      // Close menu after picker is open (deferred so React doesn't unmount mid-handler)
      setTimeout(() => setCanvasMenu(null), 0);
    } else {
      // Set dialog FIRST, then close menu in the same batch
      setImportDialog({ type, mode: "url", urlInput: "" });
      // Defer menu close to next tick so React can batch the dialog open
      setTimeout(() => setCanvasMenu(null), 0);
    }
  }, []);

  const confirmImport = useCallback(() => {
    if (!importDialog) return;
    const { type, mode, file, previewUrl, urlInput, fileName } = importDialog;
    setImportDialog(null);

    if (mode === "file" && file) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const store = useCanvasStore.getState();
        const cardNum = store.cards.length + 1;
        const refId = `${type === "image" ? "img" : "vid"}-${cardNum}`;
        const title = (fileName || "imported").replace(/\.[^.]+$/, "").slice(0, 40);
        const card = store.addCard({ type, title, refId });
        store.updateCard(card.id, { url: dataUrl });
        useChatStore.getState().addMessage(
          `Imported ${type}: ${refId} — "${title}". Right-click for actions.`,
          "system"
        );
      };
      reader.readAsDataURL(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    } else if (mode === "url" && urlInput?.trim()) {
      const url = urlInput.trim();
      const store = useCanvasStore.getState();
      const cardNum = store.cards.length + 1;
      const refId = `${type === "image" ? "img" : "vid"}-${cardNum}`;
      const title = url.split("/").pop()?.split("?")[0]?.slice(0, 40) || `Imported ${type}`;
      const card = store.addCard({ type, title, refId });
      store.updateCard(card.id, { url });
      useChatStore.getState().addMessage(
        `Imported ${type} from URL: ${refId} — "${title}". Right-click for actions.`,
        "system"
      );
    }
  }, [importDialog]);

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

      {/* Canvas context menu — import media */}
      {canvasMenu && (
        <>
        {/* Transparent backdrop — click to dismiss */}
        <div className="fixed inset-0 z-[1999]" onClick={() => setCanvasMenu(null)} />
        <div
          ref={canvasMenuRef}
          className="fixed z-[2000] min-w-[180px] rounded-xl border border-[var(--border)] bg-[rgba(20,20,20,0.97)] p-1 shadow-xl backdrop-blur-xl"
          style={{ left: canvasMenu.x, top: canvasMenu.y }}
        >
          <div className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            Import Media
          </div>
          <button onClick={() => openImportDialog("image", "file")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-white/[0.08] hover:text-[var(--text)]">
            <span>🖼</span> Import Image (file)
          </button>
          <button onClick={() => openImportDialog("image", "url")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-white/[0.08] hover:text-[var(--text)]">
            <span>🔗</span> Import Image (URL)
          </button>
          <div className="my-1 border-t border-white/[0.06]" />
          <button onClick={() => openImportDialog("video", "file")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-white/[0.08] hover:text-[var(--text)]">
            <span>🎬</span> Import Video (file)
          </button>
          <button onClick={() => openImportDialog("video", "url")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-white/[0.08] hover:text-[var(--text)]">
            <span>🔗</span> Import Video (URL)
          </button>
        </div>
        </>
      )}

      {/* Import preview dialog */}
      {importDialog && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { if (importDialog.previewUrl) URL.revokeObjectURL(importDialog.previewUrl); setImportDialog(null); }}>
          <div className="w-[420px] rounded-2xl border border-[var(--border)] bg-[rgba(25,25,25,0.98)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[var(--text)]">
              Import {importDialog.type === "image" ? "Image" : "Video"}
            </h3>

            {/* URL input mode */}
            {importDialog.mode === "url" && (
              <div className="mt-3">
                <input
                  autoFocus
                  type="url"
                  placeholder={`Paste ${importDialog.type} URL…`}
                  value={importDialog.urlInput || ""}
                  onChange={(e) => setImportDialog({ ...importDialog, urlInput: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmImport(); }}
                  className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--border-hover)]"
                />
                {/* URL preview */}
                {importDialog.urlInput && importDialog.urlInput.startsWith("http") && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
                    {importDialog.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={importDialog.urlInput} alt="preview" className="max-h-[200px] w-full object-contain bg-black/30"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <video src={importDialog.urlInput} controls className="max-h-[200px] w-full object-contain bg-black/30" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* File preview */}
            {importDialog.mode === "file" && importDialog.previewUrl && (
              <div className="mt-3">
                <div className="text-[10px] text-[var(--text-dim)] mb-2">{importDialog.fileName}</div>
                <div className="overflow-hidden rounded-lg border border-white/[0.06]">
                  {importDialog.type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={importDialog.previewUrl} alt="preview" className="max-h-[200px] w-full object-contain bg-black/30" />
                  ) : (
                    <video src={importDialog.previewUrl} controls className="max-h-[200px] w-full object-contain bg-black/30" />
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => { if (importDialog.previewUrl) URL.revokeObjectURL(importDialog.previewUrl); setImportDialog(null); }}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]">
                Cancel
              </button>
              <button onClick={confirmImport}
                disabled={importDialog.mode === "url" && !importDialog.urlInput?.trim()}
                className="rounded-lg bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40">
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
