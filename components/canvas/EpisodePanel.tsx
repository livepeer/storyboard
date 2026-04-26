"use client";

import { useState, useEffect, useCallback } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import type { Card } from "@/lib/canvas/types";

interface EpisodeActionRequest {
  episodeId: string;
  name: string;
  cardIds: string[];
}

/**
 * Episode Actions Panel — modal for rendering, exporting, sharing an episode.
 * Lets users reorder cards, pick music, choose export format.
 */
export function EpisodePanel() {
  const [request, setRequest] = useState<EpisodeActionRequest | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [musicCardId, setMusicCardId] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Listen for episode-actions events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as EpisodeActionRequest;
      setRequest(detail);
      setSelectedIds(new Set(detail.cardIds));
      setOrderedIds(detail.cardIds);
      setMusicCardId(null);
      setRendering(false);
    };
    window.addEventListener("episode-actions", handler);
    return () => window.removeEventListener("episode-actions", handler);
  }, []);

  const allCards = useCanvasStore((s) => s.cards);

  const close = useCallback(() => setRequest(null), []);

  if (!request) return null;

  const episodeCards = orderedIds
    .map((id) => allCards.find((c) => c.id === id))
    .filter((c): c is Card => !!c);
  const mediaCards = episodeCards.filter((c) => c.url && (c.type === "image" || c.type === "video"));
  const audioCards = episodeCards.filter((c) => c.url && c.type === "audio");
  const allAudioCards = allCards.filter((c) => c.url && c.type === "audio");

  const moveCard = (idx: number, dir: -1 | 1) => {
    const newOrder = [...orderedIds];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    setOrderedIds(newOrder);
  };

  const toggleCard = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleRender = async () => {
    const cards = mediaCards.filter((c) => selectedIds.has(c.id));
    if (cards.length === 0) return;
    setRendering(true);

    const say = useChatStore.getState().addMessage;
    const progressMsg = say(`Rendering "${request.name}" (${cards.length} cards)... 0%`, "system");

    try {
      const { renderProject } = await import("@livepeer/creative-kit");
      const musicUrl = musicCardId ? allCards.find((c) => c.id === musicCardId)?.url : audioCards[0]?.url;

      const result = await renderProject({
        cards: cards.map((c) => ({
          refId: c.refId, url: c.url!, type: c.type as "image" | "video",
          duration: c.type === "video" ? undefined : 4,
        })),
        musicSource: musicUrl || undefined,
        transition: "crossfade",
        transitionDuration: 0.5,
        onProgress: (pct) => {
          useChatStore.getState().updateMessage(progressMsg.id, `Rendering "${request.name}"... ${Math.round(pct * 100)}%`);
        },
      });

      useChatStore.getState().updateMessage(progressMsg.id,
        `Rendered "${request.name}" — ${result.duration.toFixed(1)}s (${(result.size / 1024 / 1024).toFixed(1)}MB)`
      );

      useCanvasStore.getState().addCard({
        type: "video", title: `${request.name} — rendered`,
        refId: `render-${Date.now()}`, url: result.url,
      });
      const a = document.createElement("a"); a.href = result.url; a.download = result.fileName; a.click();
    } catch (e) {
      useChatStore.getState().updateMessage(progressMsg.id, `Render failed: ${(e as Error).message?.slice(0, 80)}`);
    }
    setRendering(false);
    close();
  };

  const handleExport = async (format: string) => {
    const imgCards = mediaCards.filter((c) => selectedIds.has(c.id) && c.type === "image");
    if (imgCards.length === 0) return;

    if (format === "images") {
      const { downloadCards, getSavableCards } = await import("@/lib/utils/download");
      await downloadCards(getSavableCards(imgCards));
      useChatStore.getState().addMessage(`Exported ${imgCards.length} images from "${request.name}"`, "system");
    } else {
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
      useChatStore.getState().addMessage(`Exported "${request.name}" for ${format}`, "system");
    }
    close();
  };

  const handleJson = () => {
    const data = {
      episode: request.name,
      exportedAt: new Date().toISOString(),
      cards: episodeCards.filter((c) => selectedIds.has(c.id)).map((c) => ({
        refId: c.refId, type: c.type, title: c.title, url: c.url, prompt: c.prompt, capability: c.capability,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${request.name}.json`; a.click();
    URL.revokeObjectURL(url);
    useChatStore.getState().addMessage(`Exported "${request.name}" as JSON`, "system");
    close();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm" onClick={close} />

      {/* Panel */}
      <div className="fixed top-[10vh] left-1/2 -translate-x-1/2 z-[3001] w-[520px] max-h-[75vh] overflow-y-auto rounded-2xl border border-purple-500/30 bg-[#14141f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-sm font-semibold text-white">{request.name}</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">{mediaCards.length} media · {audioCards.length} audio</p>
          </div>
          <button onClick={close} className="text-gray-500 hover:text-white text-lg">✕</button>
        </div>

        {/* Card list — reorder + select */}
        <div className="px-5 py-3">
          <div className="text-[10px] text-gray-500 mb-2 font-semibold">CARDS (drag to reorder, click to toggle)</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {orderedIds.map((id, idx) => {
              const card = allCards.find((c) => c.id === id);
              if (!card) return null;
              const selected = selectedIds.has(id);
              return (
                <div key={id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${selected ? "bg-purple-500/10 text-white" : "bg-white/[0.02] text-gray-500"}`}>
                  <input type="checkbox" checked={selected} onChange={() => toggleCard(id)} className="accent-purple-500" />
                  {card.url && card.type === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate">{card.title || card.refId}</span>
                  <span className="text-[9px] text-gray-600">{card.type}</span>
                  <button onClick={() => moveCard(idx, -1)} className="text-gray-600 hover:text-white text-xs" title="Move up">▲</button>
                  <button onClick={() => moveCard(idx, 1)} className="text-gray-600 hover:text-white text-xs" title="Move down">▼</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Music selection */}
        <div className="px-5 py-3 border-t border-white/5">
          <div className="text-[10px] text-gray-500 mb-2 font-semibold">MUSIC (optional — mixed into render)</div>
          <select
            value={musicCardId || ""}
            onChange={(e) => setMusicCardId(e.target.value || null)}
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-gray-300 outline-none"
          >
            <option value="">No music</option>
            {audioCards.map((c) => <option key={c.id} value={c.id}>{c.title || c.refId} (episode)</option>)}
            {allAudioCards.filter((c) => !audioCards.find((a) => a.id === c.id)).map((c) =>
              <option key={c.id} value={c.id}>{c.title || c.refId} (canvas)</option>
            )}
          </select>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-white/5 flex flex-wrap gap-2">
          <button
            onClick={handleRender}
            disabled={mediaCards.filter((c) => selectedIds.has(c.id)).length === 0 || rendering}
            className="rounded-lg bg-purple-500/20 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 disabled:opacity-40"
          >
            {rendering ? "Rendering..." : `🎬 Render Video (${mediaCards.filter((c) => selectedIds.has(c.id)).length} cards)`}
          </button>
          <button onClick={() => handleExport("images")} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10">📥 Images</button>
          <button onClick={() => handleExport("instagram")} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10">📱 IG</button>
          <button onClick={() => handleExport("tiktok")} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10">📱 TT</button>
          <button onClick={() => handleExport("youtube")} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10">📺 YT</button>
          <button onClick={handleJson} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-400 hover:bg-white/10">📋 JSON</button>
        </div>
      </div>
    </>
  );
}
