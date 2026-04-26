"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { useChatStore } from "@/lib/chat/store";
import type { Card } from "@/lib/canvas/types";

/**
 * Episode/Selection Panel — modal dialog for batch operations.
 * Opened by SelectionBar or episode ⋯ button.
 * Lets user: pick cards, reorder, choose music, then render/export/animate.
 */
export function EpisodePanel() {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"render" | "export" | "animate">("render");
  const [initialCardIds, setInitialCardIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [musicCardId, setMusicCardId] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"images" | "instagram" | "tiktok" | "youtube" | "json">("images");
  const [busy, setBusy] = useState(false);

  const allCards = useCanvasStore((s) => s.cards);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { cardIds: string[]; action: string };
      setInitialCardIds(detail.cardIds);
      setSelectedIds(new Set(detail.cardIds));
      setOrderedIds(detail.cardIds);
      setAction((detail.action as "render" | "export" | "animate") || "render");
      setMusicCardId(null);
      setBusy(false);
      setOpen(true);
    };
    window.addEventListener("episode-actions", handler);
    return () => window.removeEventListener("episode-actions", handler);
  }, []);

  const close = useCallback(() => { setOpen(false); setBusy(false); }, []);

  const episodeCards = useMemo(() =>
    orderedIds.map((id) => allCards.find((c) => c.id === id)).filter((c): c is Card => !!c),
    [orderedIds, allCards]
  );
  const mediaCards = useMemo(() => episodeCards.filter((c) => c.url && (c.type === "image" || c.type === "video")), [episodeCards]);
  const selectedMedia = useMemo(() => mediaCards.filter((c) => selectedIds.has(c.id)), [mediaCards, selectedIds]);
  const allAudioCards = useMemo(() => allCards.filter((c) => c.url && c.type === "audio"), [allCards]);

  const moveCard = (idx: number, dir: -1 | 1) => {
    const a = [...orderedIds];
    const t = idx + dir;
    if (t < 0 || t >= a.length) return;
    [a[idx], a[t]] = [a[t], a[idx]];
    setOrderedIds(a);
  };

  const toggleCard = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  // ── Render ──
  const handleRender = async () => {
    if (selectedMedia.length === 0) return;
    setBusy(true);
    const progressMsg = useChatStore.getState().addMessage(`Rendering ${selectedMedia.length} cards... 0%`, "system");
    try {
      const { renderProject } = await import("@livepeer/creative-kit");
      const music = musicCardId ? allCards.find((c) => c.id === musicCardId)?.url : undefined;
      const result = await renderProject({
        cards: selectedMedia.map((c) => ({ refId: c.refId, url: c.url!, type: c.type as "image" | "video", duration: c.type === "video" ? undefined : 4 })),
        musicSource: music, transition: "crossfade", transitionDuration: 0.5,
        onProgress: (pct) => useChatStore.getState().updateMessage(progressMsg.id, `Rendering... ${Math.round(pct * 100)}%`),
      });
      useChatStore.getState().updateMessage(progressMsg.id, `Rendered — ${result.duration.toFixed(1)}s (${(result.size / 1024 / 1024).toFixed(1)}MB)`);
      useCanvasStore.getState().addCard({ type: "video", title: `Rendered (${selectedMedia.length})`, refId: `render-${Date.now()}`, url: result.url });
      const a = document.createElement("a"); a.href = result.url; a.download = result.fileName; a.click();
    } catch (e) {
      useChatStore.getState().updateMessage(progressMsg.id, `Render failed: ${(e as Error).message?.slice(0, 80)}`);
    }
    setBusy(false); close();
  };

  // ── Export (ZIP) ──
  const handleExport = async () => {
    const imgCards = selectedMedia.filter((c) => c.type === "image");
    if (imgCards.length === 0) return;
    setBusy(true);

    try {
      if (exportFormat === "json") {
        const data = { exportedAt: new Date().toISOString(), cards: imgCards.map((c) => ({ refId: c.refId, type: c.type, title: c.title, url: c.url, prompt: c.prompt, capability: c.capability })) };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `export-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
      } else if (exportFormat === "images") {
        // ZIP download
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        for (const c of imgCards) {
          try {
            const resp = await fetch(c.url!);
            const blob = await resp.blob();
            const ext = blob.type.includes("png") ? "png" : "jpg";
            zip.file(`${c.refId}.${ext}`, blob);
          } catch { /* skip failed */ }
        }
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob); const a = document.createElement("a"); a.href = url; a.download = `images-${Date.now()}.zip`; a.click(); URL.revokeObjectURL(url);
      } else {
        // Social platform — ZIP with cropped images
        const { exportForSocial } = await import("@livepeer/creative-kit");
        const { default: JSZip } = await import("jszip");
        const results = await exportForSocial({ platform: exportFormat as any, cards: imgCards.map((c) => ({ refId: c.refId, url: c.url!, type: "image" as const })) });
        const zip = new JSZip();
        for (const r of results) for (const f of r.files) zip.file(f.name, f.blob);
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob); const a = document.createElement("a"); a.href = url; a.download = `${exportFormat}-${Date.now()}.zip`; a.click(); URL.revokeObjectURL(url);
      }
      useChatStore.getState().addMessage(`Exported ${imgCards.length} items as ${exportFormat}`, "system");
    } catch (e) {
      useChatStore.getState().addMessage(`Export failed: ${(e as Error).message?.slice(0, 80)}`, "system");
    }
    setBusy(false); close();
  };

  // ── Animate ──
  const handleAnimate = async () => {
    const imgCards = selectedMedia.filter((c) => c.type === "image");
    if (imgCards.length === 0) return;
    setBusy(true);
    try {
      const { executeTool } = await import("@/lib/tools/registry");
      const steps = imgCards.map((c) => ({ action: "animate", source_url: c.url, prompt: c.prompt || c.title }));
      useChatStore.getState().addMessage(`Animating ${steps.length} images...`, "system");
      await executeTool("create_media", { steps });
    } catch {}
    setBusy(false); close(); useCanvasStore.getState().clearSelection();
  };

  if (!open) return null;

  const actionLabel = action === "render" ? "Render Video" : action === "export" ? "Export" : "Animate";
  const actionHandler = action === "render" ? handleRender : action === "export" ? handleExport : handleAnimate;

  return (
    <>
      <div className="fixed inset-0 z-[3000] bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="fixed top-[10vh] left-1/2 -translate-x-1/2 z-[3001] w-[520px] max-h-[75vh] overflow-y-auto rounded-2xl border border-purple-500/30 bg-[#14141f] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <h2 className="text-sm font-semibold text-white">{actionLabel}</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">{selectedMedia.length} media selected</p>
          </div>
          <div className="flex gap-2">
            {/* Tab switcher */}
            {(["render", "export", "animate"] as const).map((a) => (
              <button key={a} onClick={() => setAction(a)}
                className={`rounded-lg px-3 py-1 text-[10px] transition-colors ${action === a ? "bg-purple-500/20 text-purple-300 font-semibold" : "text-gray-500 hover:text-gray-300"}`}>
                {a === "render" ? "🎬 Render" : a === "export" ? "📥 Export" : "▶ Animate"}
              </button>
            ))}
            <button onClick={close} className="text-gray-500 hover:text-white text-lg ml-2">✕</button>
          </div>
        </div>

        {/* Card list */}
        <div className="px-5 py-3">
          <div className="text-[10px] text-gray-500 mb-2 font-semibold">CARDS — click to toggle, arrows to reorder</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {orderedIds.map((id, idx) => {
              const card = allCards.find((c) => c.id === id);
              if (!card) return null;
              const selected = selectedIds.has(id);
              return (
                <div key={id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer ${selected ? "bg-purple-500/10 text-white" : "bg-white/[0.02] text-gray-500"}`}
                  onClick={() => toggleCard(id)}>
                  <input type="checkbox" checked={selected} readOnly className="accent-purple-500 pointer-events-none" />
                  {card.url && card.type === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate">{card.title || card.refId}</span>
                  <span className="text-[9px] text-gray-600">{card.type}{card.capability ? ` · ${card.capability}` : ""}</span>
                  <button onClick={(e) => { e.stopPropagation(); moveCard(idx, -1); }} className="text-gray-600 hover:text-white text-xs px-1">▲</button>
                  <button onClick={(e) => { e.stopPropagation(); moveCard(idx, 1); }} className="text-gray-600 hover:text-white text-xs px-1">▼</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Music (render only) */}
        {action === "render" && (
          <MusicPicker
            musicCardId={musicCardId}
            setMusicCardId={setMusicCardId}
            allAudioCards={allAudioCards}
          />
        )}

        {/* Export format (export only) */}
        {action === "export" && (
          <div className="px-5 py-3 border-t border-white/5">
            <div className="text-[10px] text-gray-500 mb-2 font-semibold">FORMAT</div>
            <div className="flex gap-2 flex-wrap">
              {([
                { id: "images", label: "📥 Original Images" },
                { id: "instagram", label: "📱 Instagram (1:1)" },
                { id: "tiktok", label: "📱 TikTok (9:16)" },
                { id: "youtube", label: "📺 YouTube (16:9)" },
                { id: "json", label: "📋 JSON Data" },
              ] as const).map((f) => (
                <button key={f.id} onClick={() => setExportFormat(f.id)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] transition-colors border ${exportFormat === f.id ? "border-purple-500/50 bg-purple-500/10 text-purple-300" : "border-white/10 text-gray-500 hover:text-gray-300"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action button */}
        <div className="px-5 py-4 border-t border-white/5 flex justify-between items-center">
          <span className="text-[10px] text-gray-600">
            {action === "render" && `${selectedMedia.length} cards → video${musicCardId ? " + music" : ""}`}
            {action === "export" && `${selectedMedia.filter((c) => c.type === "image").length} images → ${exportFormat} ZIP`}
            {action === "animate" && `${selectedMedia.filter((c) => c.type === "image").length} images → video clips`}
          </span>
          <button onClick={actionHandler} disabled={selectedMedia.length === 0 || busy}
            className="rounded-lg bg-purple-500/20 px-5 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 disabled:opacity-40 transition-colors">
            {busy ? "Working..." : actionLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/** Music picker — choose existing audio, or generate new music inline. */
function MusicPicker({ musicCardId, setMusicCardId, allAudioCards }: {
  musicCardId: string | null;
  setMusicCardId: (id: string | null) => void;
  allAudioCards: Card[];
}) {
  const [generating, setGenerating] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [showGen, setShowGen] = useState(false);

  const handleGenerate = async () => {
    if (!genPrompt.trim() || generating) return;
    setGenerating(true);
    useChatStore.getState().addMessage(`Generating music: "${genPrompt.slice(0, 40)}"...`, "system");

    try {
      const { runInference } = await import("@/lib/sdk/client");
      const result = await runInference({
        capability: "music",
        prompt: genPrompt.trim(),
        params: {
          prompt: genPrompt.trim(),
          lyrics_prompt: `[Intro]\n[Verse]\n${genPrompt.trim()}\n[Chorus]\n${genPrompt.trim()}\n[Outro]`,
        },
      });

      const r = result as Record<string, unknown>;
      const d = (r.data ?? r) as Record<string, unknown>;
      const audioUrl = (r.audio_url as string) ?? (d.audio as { url: string })?.url ?? (d.url as string);

      if (audioUrl) {
        const card = useCanvasStore.getState().addCard({
          type: "audio", title: `Music: ${genPrompt.slice(0, 25)}`,
          refId: `music-${Date.now()}`, url: audioUrl,
        });
        setMusicCardId(card.id);
        useChatStore.getState().addMessage("Music generated and selected!", "system");
        setShowGen(false);
        setGenPrompt("");
      } else {
        useChatStore.getState().addMessage("Music generation returned no audio.", "system");
      }
    } catch (e) {
      useChatStore.getState().addMessage(`Music failed: ${(e as Error).message?.slice(0, 80)}`, "system");
    }
    setGenerating(false);
  };

  return (
    <div className="px-5 py-3 border-t border-white/5">
      <div className="text-[10px] text-gray-500 mb-2 font-semibold">MUSIC (optional — mixed into video)</div>

      <select value={musicCardId || ""} onChange={(e) => { setMusicCardId(e.target.value || null); setShowGen(false); }}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-gray-300 outline-none">
        <option value="">No music</option>
        {allAudioCards.map((c) => <option key={c.id} value={c.id}>{c.title || c.refId}</option>)}
      </select>

      {!showGen ? (
        <button onClick={() => setShowGen(true)}
          className="mt-2 w-full rounded-lg border border-dashed border-purple-500/30 px-3 py-2 text-[10px] text-purple-400/70 hover:bg-purple-500/5 transition-colors text-center">
          🎵 Generate new music...
        </button>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            type="text" value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)}
            placeholder="calm jazz piano, upbeat electronic..."
            onKeyDown={(e) => { if (e.key === "Enter") handleGenerate(); if (e.key === "Escape") setShowGen(false); }}
            autoFocus
            className="flex-1 rounded-lg border border-purple-500/30 bg-black/30 px-3 py-1.5 text-xs text-gray-300 outline-none placeholder:text-gray-600 focus:border-purple-500/50"
          />
          <button onClick={handleGenerate} disabled={!genPrompt.trim() || generating}
            className="rounded-lg bg-purple-500/20 px-3 py-1.5 text-[10px] font-semibold text-purple-300 hover:bg-purple-500/30 disabled:opacity-40 whitespace-nowrap">
            {generating ? "..." : "Generate"}
          </button>
        </div>
      )}
    </div>
  );
}
