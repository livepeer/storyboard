"use client";

import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import { useHierarchyActions } from "./HierarchyActions";
import { useEpisodeStore } from "@/lib/episodes/store";

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
      {imageCount >= 2 && (() => {
        // Check if selected cards belong to one episode → offer "Animate Episode"
        const episodes = useEpisodeStore.getState().episodes;
        const ep = episodes.find((e) => selectedCards.every((c) => e.cardIds.includes(c.id)));
        if (!ep) return null;
        return (
          <button
            onClick={async () => {
              const { animateEpisode } = await import("@/lib/episodes/animate");
              animateEpisode({ episodeId: ep.id });
              clearSelection();
            }}
            className="rounded-lg px-3 py-1 text-[11px] text-amber-300 hover:bg-amber-500/10 transition-colors"
          >
            🎬 Episode→Video
          </button>
        );
      })()}
      {imageCount >= 1 && (
        <button onClick={() => openPanel("export")} className={btn}>📥 Export ({imageCount})</button>
      )}
      <HierarchyButtons />
      <div className="h-4 w-px bg-white/10" />
      <button onClick={handleDelete} className="rounded-lg px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors">
        🗑 ({count})
      </button>
      <button onClick={() => clearSelection()} className="rounded-lg px-1.5 py-1 text-[11px] text-white/40 hover:text-white/70">✕</button>
    </div>
  );
}

/** Hierarchy grouping buttons — shown when selection spans multiple episodes/epics. */
function HierarchyButtons() {
  const { canGroupEpic, canGroupStory, episodeIds, epicIds } = useHierarchyActions();
  const btn = "rounded-lg px-3 py-1 text-[11px] text-blue-300 hover:bg-blue-500/10 transition-colors";

  if (!canGroupEpic && !canGroupStory) return null;

  return (
    <>
      <div className="h-4 w-px bg-white/10" />
      {canGroupEpic && (
        <button
          onClick={() => {
            const name = prompt("Epic name:", `Epic ${Date.now().toString(36).slice(-4)}`);
            if (!name) return;
            useEpisodeStore.getState().createEpic(name, episodeIds);
            useChatStore.getState().addMessage(`Epic "${name}" created with ${episodeIds.length} episodes.`, "system");
            useCanvasStore.getState().clearSelection();
          }}
          className={btn}
        >
          📚 Group into Epic ({episodeIds.length} episodes)
        </button>
      )}
      {canGroupStory && (
        <button
          onClick={() => {
            const name = prompt("Story arc name:", `Arc ${Date.now().toString(36).slice(-4)}`);
            if (!name) return;
            useEpisodeStore.getState().createStory(name, epicIds);
            useChatStore.getState().addMessage(`Story arc "${name}" created with ${epicIds.length} epics.`, "system");
            useCanvasStore.getState().clearSelection();
          }}
          className={btn}
        >
          🏛 Group into Story Arc ({epicIds.length} epics)
        </button>
      )}
    </>
  );
}
