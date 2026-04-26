"use client";

import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";

/**
 * Floating action bar — appears when 2+ cards are selected.
 * Buttons open the EpisodePanel dialog for card selection + execution.
 * Quick actions (delete, deselect) execute immediately.
 */
export function SelectionBar() {
  const selectedIds = useCanvasStore((s) => s.selectedCardIds);
  const cards = useCanvasStore((s) => s.cards);
  const removeCard = useCanvasStore((s) => s.removeCard);
  const clearSelection = useCanvasStore((s) => s.clearSelection);

  const count = selectedIds.size;
  if (count < 2) return null;

  const selectedCards = cards.filter((c) => selectedIds.has(c.id));
  const mediaCards = selectedCards.filter((c) => c.url && (c.type === "image" || c.type === "video"));
  const imageCount = mediaCards.filter((c) => c.type === "image").length;

  const openPanel = (action: string) => {
    window.dispatchEvent(new CustomEvent("episode-actions", {
      detail: { cardIds: Array.from(selectedIds), action },
    }));
  };

  const handleDelete = () => {
    for (const id of selectedIds) removeCard(id);
    clearSelection();
  };

  const btn = "rounded-lg px-3 py-1 text-[11px] text-white/80 hover:bg-white/10 transition-colors";

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[2000] flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-[rgba(20,20,30,0.95)] px-3 py-2 shadow-2xl backdrop-blur-xl">
      <span className="text-xs font-medium text-purple-300">{count} selected</span>
      <div className="h-4 w-px bg-white/10" />
      {mediaCards.length >= 1 && (
        <button onClick={() => openPanel("render")} className={btn}>🎬 Render ({mediaCards.length})</button>
      )}
      {imageCount >= 2 && (
        <button onClick={() => openPanel("animate")} className={btn}>▶ Animate ({imageCount})</button>
      )}
      {imageCount >= 1 && (
        <button onClick={() => openPanel("export")} className={btn}>📥 Export ({imageCount})</button>
      )}
      <div className="h-4 w-px bg-white/10" />
      <button onClick={handleDelete} className="rounded-lg px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors">
        🗑 ({count})
      </button>
      <button onClick={() => clearSelection()} className="rounded-lg px-1.5 py-1 text-[11px] text-white/40 hover:text-white/70">✕</button>
    </div>
  );
}
