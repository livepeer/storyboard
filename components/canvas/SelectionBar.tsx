"use client";

import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";

/**
 * Floating action bar — appears when 2+ cards are selected.
 * Provides batch operations: delete, export, animate all.
 */
export function SelectionBar() {
  const selectedIds = useCanvasStore((s) => s.selectedCardIds);
  const cards = useCanvasStore((s) => s.cards);
  const removeCard = useCanvasStore((s) => s.removeCard);
  const clearSelection = useCanvasStore((s) => s.clearSelection);

  const count = selectedIds.size;
  if (count < 2) return null;

  const selectedCards = cards.filter((c) => selectedIds.has(c.id));
  const imageCount = selectedCards.filter((c) => c.type === "image" && c.url).length;

  const handleDelete = () => {
    for (const id of selectedIds) removeCard(id);
    clearSelection();
  };

  const handleExport = async () => {
    try {
      const { exportForSocial } = await import("@livepeer/creative-kit");
      const exportCards = selectedCards
        .filter((c) => c.url && c.type === "image")
        .map((c) => ({ refId: c.refId, url: c.url!, type: "image" as const }));
      if (exportCards.length === 0) return;

      const results = await exportForSocial({ platform: "youtube", cards: exportCards });
      for (const r of results) {
        for (const f of r.files) {
          const url = URL.createObjectURL(f.blob);
          const a = document.createElement("a");
          a.href = url; a.download = f.name; a.click();
          URL.revokeObjectURL(url);
        }
      }
      useChatStore.getState().addMessage(`Exported ${exportCards.length} images`, "system");
    } catch { /* non-critical */ }
  };

  const handleAnimateAll = async () => {
    const imgCards = selectedCards.filter((c) => c.type === "image" && c.url);
    if (imgCards.length === 0) return;

    try {
      const { executeTool } = await import("@/lib/tools/registry");
      const steps = imgCards.map((c) => ({
        action: "animate",
        source_url: c.url,
        prompt: c.prompt || c.title,
      }));
      useChatStore.getState().addMessage(`Animating ${steps.length} images...`, "system");
      await executeTool("create_media", { steps });
      useChatStore.getState().addMessage(`${steps.length} animations started`, "system");
    } catch { /* non-critical */ }
    clearSelection();
  };

  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[2000] flex items-center gap-2 rounded-xl border border-purple-500/30 bg-[rgba(20,20,30,0.95)] px-4 py-2 shadow-2xl backdrop-blur-xl">
      <span className="text-xs font-medium text-purple-300">{count} selected</span>
      <div className="h-4 w-px bg-white/10" />
      {imageCount >= 2 && (
        <button
          onClick={handleAnimateAll}
          className="rounded-lg px-3 py-1 text-[11px] text-white/80 hover:bg-white/10 transition-colors"
        >
          Animate all ({imageCount})
        </button>
      )}
      {imageCount >= 1 && (
        <button
          onClick={handleExport}
          className="rounded-lg px-3 py-1 text-[11px] text-white/80 hover:bg-white/10 transition-colors"
        >
          Export
        </button>
      )}
      <button
        onClick={handleDelete}
        className="rounded-lg px-3 py-1 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors"
      >
        Delete ({count})
      </button>
      <button
        onClick={() => clearSelection()}
        className="rounded-lg px-2 py-1 text-[11px] text-white/40 hover:text-white/70 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
