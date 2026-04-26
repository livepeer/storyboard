"use client";

import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";

/**
 * Floating action bar — appears when 2+ cards are selected.
 * Full episode workflow: render, animate, export (social + images + JSON), delete.
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
  const audioCards = selectedCards.filter((c) => c.url && c.type === "audio");

  const handleRender = async () => {
    if (mediaCards.length === 0) return;
    const say = useChatStore.getState().addMessage;
    const progressMsg = say(`Rendering ${mediaCards.length} cards... 0%`, "system");

    try {
      const { renderProject } = await import("@livepeer/creative-kit");
      const result = await renderProject({
        cards: mediaCards.map((c) => ({
          refId: c.refId, url: c.url!, type: c.type as "image" | "video",
          duration: c.type === "video" ? undefined : 4,
        })),
        musicSource: audioCards[0]?.url || undefined,
        transition: "crossfade",
        transitionDuration: 0.5,
        onProgress: (pct) => {
          useChatStore.getState().updateMessage(progressMsg.id, `Rendering... ${Math.round(pct * 100)}%`);
        },
      });
      useChatStore.getState().updateMessage(progressMsg.id,
        `Rendered ${mediaCards.length} cards — ${result.duration.toFixed(1)}s (${(result.size / 1024 / 1024).toFixed(1)}MB)`
      );
      useCanvasStore.getState().addCard({
        type: "video", title: `Rendered (${mediaCards.length} cards)`,
        refId: `render-${Date.now()}`, url: result.url,
      });
      const a = document.createElement("a"); a.href = result.url; a.download = result.fileName; a.click();
    } catch (e) {
      useChatStore.getState().updateMessage(progressMsg.id, `Render failed: ${(e as Error).message?.slice(0, 80)}`);
    }
  };

  const handleAnimateAll = async () => {
    const imgCards = mediaCards.filter((c) => c.type === "image");
    if (imgCards.length === 0) return;
    try {
      const { executeTool } = await import("@/lib/tools/registry");
      const steps = imgCards.map((c) => ({ action: "animate", source_url: c.url, prompt: c.prompt || c.title }));
      useChatStore.getState().addMessage(`Animating ${steps.length} images...`, "system");
      await executeTool("create_media", { steps });
    } catch {}
    clearSelection();
  };

  const handleExport = async (format: string) => {
    const imgCards = mediaCards.filter((c) => c.type === "image");
    if (format === "images") {
      const { downloadCards, getSavableCards } = await import("@/lib/utils/download");
      await downloadCards(getSavableCards(imgCards));
      useChatStore.getState().addMessage(`Downloaded ${imgCards.length} images`, "system");
      return;
    }
    if (format === "json") {
      const data = {
        exportedAt: new Date().toISOString(),
        cards: selectedCards.map((c) => ({ refId: c.refId, type: c.type, title: c.title, url: c.url, prompt: c.prompt, capability: c.capability })),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `selection-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    // Social platform
    try {
      const { exportForSocial } = await import("@livepeer/creative-kit");
      const results = await exportForSocial({
        platform: format as any,
        cards: imgCards.map((c) => ({ refId: c.refId, url: c.url!, type: "image" as const })),
      });
      for (const r of results) for (const f of r.files) {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement("a"); a.href = url; a.download = f.name; a.click();
        URL.revokeObjectURL(url);
      }
      useChatStore.getState().addMessage(`Exported for ${format}`, "system");
    } catch {}
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
        <button onClick={handleRender} className={btn}>
          🎬 Render{audioCards.length > 0 ? " + Music" : ""} ({mediaCards.length})
        </button>
      )}
      {imageCount >= 2 && (
        <button onClick={handleAnimateAll} className={btn}>▶ Animate ({imageCount})</button>
      )}
      {imageCount >= 1 && (
        <>
          <button onClick={() => handleExport("images")} className={btn}>📥</button>
          <button onClick={() => handleExport("instagram")} className={btn}>IG</button>
          <button onClick={() => handleExport("tiktok")} className={btn}>TT</button>
          <button onClick={() => handleExport("youtube")} className={btn}>YT</button>
        </>
      )}
      <button onClick={() => handleExport("json")} className={btn}>JSON</button>
      <div className="h-4 w-px bg-white/10" />
      <button onClick={handleDelete} className="rounded-lg px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors">
        🗑 ({count})
      </button>
      <button onClick={() => clearSelection()} className="rounded-lg px-1.5 py-1 text-[11px] text-white/40 hover:text-white/70">✕</button>
    </div>
  );
}
