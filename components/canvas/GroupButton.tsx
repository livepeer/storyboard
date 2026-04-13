"use client";

import { useState, useEffect, useRef } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useEpisodeStore } from "@/lib/episodes/store";
import { useChatStore } from "@/lib/chat/store";
import { downloadCards, getSavableCards } from "@/lib/utils/download";

export function GroupButton() {
  const selectedCardIds = useCanvasStore((s) => s.selectedCardIds);
  const cards = useCanvasStore((s) => s.cards);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const viewport = useCanvasStore((s) => s.viewport);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [flash, setFlash] = useState<{ name: string; x: number; y: number } | null>(null);

  // Auto-dismiss flash after 1.5s
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  // Save last known position so flash doesn't jump to NaN when selection clears
  const lastPos = useRef({ x: 0, y: 0 });

  const selected = Array.from(selectedCardIds);
  const selectedCards = cards.filter((c) => selectedCardIds.has(c.id));

  // Compute centroid only when we have selected cards
  if (selectedCards.length >= 2) {
    const cx = selectedCards.reduce((s, c) => s + c.x + c.w / 2, 0) / selectedCards.length;
    const cy = Math.min(...selectedCards.map((c) => c.y)) - 48;
    lastPos.current = {
      x: cx * viewport.scale + viewport.panX,
      y: cy * viewport.scale + viewport.panY,
    };
  }

  // Show flash at saved position
  if (flash) {
    return (
      <div
        className="fixed z-50 flex items-center gap-2 rounded-lg bg-green-500/20 border border-green-500/40 px-4 py-2 shadow-lg"
        style={{
          left: flash.x,
          top: flash.y,
          transform: "translateX(-50%)",
          animation: "pulse 0.6s ease-in-out 2",
        }}
      >
        <span className="text-green-400 text-xs font-semibold">
          {"\u2714"} Episode &ldquo;{flash.name}&rdquo; created!
        </span>
      </div>
    );
  }

  if (selected.length < 2) return null;

  const screenX = lastPos.current.x;
  const screenY = lastPos.current.y;

  const handleCreate = () => {
    if (!name.trim()) return;
    const ep = useEpisodeStore.getState().createEpisode(name.trim(), selected);
    useEpisodeStore.getState().activateEpisode(ep.id);
    useChatStore.getState().addMessage(
      `Episode "${ep.name}" created with ${selected.length} cards`,
      "system"
    );
    // Save position BEFORE clearing selection
    setFlash({ name: ep.name, x: screenX, y: screenY });
    setNaming(false);
    setName("");
    setTimeout(() => clearSelection(), 600);
  };

  return (
    <div
      className="fixed z-50 flex items-center gap-2"
      style={{ left: screenX, top: screenY, transform: "translateX(-50%)" }}
      // Stop pointer events from reaching the canvas
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {naming ? (
        <div className="flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 shadow-lg">
          <input
            autoFocus
            className="w-36 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
            placeholder="Episode name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setNaming(false); setName(""); }
            }}
          />
          <button
            onClick={handleCreate}
            className="rounded bg-purple-500/20 px-2.5 py-1 text-[10px] font-medium text-purple-300 hover:bg-purple-500/30"
          >
            Create
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setNaming(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--surface)] border border-purple-500/30 px-3 py-1.5 text-xs text-purple-300 shadow-lg hover:bg-purple-500/10 transition-colors"
          >
            <span>+</span>
            <span>Group as Episode ({selected.length})</span>
          </button>
          {getSavableCards(selectedCards).length > 0 && (
            <button
              onClick={async () => {
                const savable = getSavableCards(selectedCards);
                useChatStore.getState().addMessage(`Saving ${savable.length} cards\u2026`, "system");
                const { ok, fail } = await downloadCards(savable);
                useChatStore.getState().addMessage(
                  fail > 0 ? `Saved ${ok}, failed ${fail}` : `Saved ${ok} cards`,
                  "system"
                );
              }}
              className="flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-green-500/30 px-3 py-1.5 text-xs text-green-300 shadow-lg hover:bg-green-500/10 transition-colors"
            >
              <span>{"\u2B07"}</span>
              <span>Save ({getSavableCards(selectedCards).length})</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
