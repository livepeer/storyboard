"use client";

import { useState } from "react";
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

  const selected = Array.from(selectedCardIds);
  if (selected.length < 2) return null;

  // Find centroid of selected cards (in canvas coords)
  const selectedCards = cards.filter((c) => selectedCardIds.has(c.id));
  const cx = selectedCards.reduce((s, c) => s + c.x + c.w / 2, 0) / selectedCards.length;
  const cy = Math.min(...selectedCards.map((c) => c.y)) - 48;

  // Convert canvas coords to screen coords
  const screenX = cx * viewport.scale + viewport.panX;
  const screenY = cy * viewport.scale + viewport.panY;

  const handleCreate = () => {
    if (!name.trim()) return;
    const ep = useEpisodeStore.getState().createEpisode(name.trim(), selected);
    useEpisodeStore.getState().activateEpisode(ep.id);
    clearSelection();
    setNaming(false);
    setName("");
  };

  return (
    <div
      className="fixed z-50 flex items-center gap-2"
      style={{ left: screenX, top: screenY, transform: "translateX(-50%)" }}
    >
      {naming ? (
        <div className="flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] px-2 py-1 shadow-lg">
          <input
            autoFocus
            className="w-32 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]"
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
            className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300 hover:bg-purple-500/30"
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
