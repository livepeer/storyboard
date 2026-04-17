"use client";

import { useState, useCallback } from "react";
import type { Film } from "@/lib/film/types";

export function FilmCard({ film }: { film: Film }) {
  const [collapsed, setCollapsed] = useState(false);

  const applyNow = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("chat-prefill", {
        detail: { text: `/film apply ${film.id}`, autoSend: true },
      })
    );
  }, [film.id]);

  const regenerate = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("chat-prefill", {
        detail: { text: `/film ${film.originalPrompt}` },
      })
    );
  }, [film.originalPrompt]);

  const copyShot = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const editShot = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent("chat-prefill", { detail: { text } }));
  }, []);

  const statusColor =
    film.status === "applied" ? "text-emerald-300" : "text-amber-300";

  const cameraIcon: Record<string, string> = {
    wide: "🎥", dolly: "🎥", medium: "📹", close: "🔍",
    pan: "↔", crane: "⬆", low: "📐", overhead: "🦅",
    pull: "↩", steady: "📹", tracking: "🏃",
  };

  const getCameraEmoji = (cam: string) => {
    const lower = cam.toLowerCase();
    for (const [key, emoji] of Object.entries(cameraIcon)) {
      if (lower.includes(key)) return emoji;
    }
    return "🎬";
  };

  return (
    <div className="group relative max-w-[95%] self-start break-words rounded-xl border border-orange-500/25 bg-orange-500/[0.06] p-3 text-xs text-[var(--text)]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="text-base leading-none">🎬</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{film.title}</span>
            <span className={`text-[9px] uppercase tracking-wide ${statusColor}`}>{film.status}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-dim)]">
            {film.shots.length} shots · {film.style} · id {film.id.slice(0, 18)}
          </div>
        </div>
        <span className="text-[10px] text-[var(--text-dim)]">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <>
          {film.characterLock && (
            <div className="mt-2 text-[10px] text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-dim)]">Character lock:</span> {film.characterLock}
            </div>
          )}

          <div className="mt-2 space-y-1.5">
            {film.shots.map((shot) => (
              <div key={shot.index} className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                    Shot {shot.index} — {shot.title}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => copyShot(shot.description)}
                      className="rounded px-1.5 py-0.5 text-[9px] text-[var(--text-dim)] hover:bg-white/[0.06]">
                      ⎘ copy
                    </button>
                    <button type="button" onClick={() => editShot(shot.description)}
                      className="rounded px-1.5 py-0.5 text-[9px] text-[var(--text-dim)] hover:bg-white/[0.06]">
                      ✎ edit
                    </button>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[9px] text-orange-300/80">
                  <span>{getCameraEmoji(shot.camera)}</span>
                  <span className="font-mono">{shot.camera}</span>
                  <span className="text-[var(--text-dim)]">· {shot.duration}s</span>
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                  {shot.description}
                </div>
              </div>
            ))}
          </div>

          {film.status !== "applied" && (
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={applyNow}
                className="rounded-lg border border-orange-500/40 bg-orange-500/15 px-2.5 py-1 text-[10px] font-semibold text-orange-300 transition-colors hover:bg-orange-500/25">
                🎬 Generate Film
              </button>
              <button type="button" onClick={regenerate}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-white/[0.08]">
                🎲 Regenerate
              </button>
              <span className="text-[9px] italic text-[var(--text-dim)]">
                or type &ldquo;apply them&rdquo;
              </span>
            </div>
          )}
          {film.status === "applied" && (
            <div className="mt-3 text-[10px] italic text-emerald-400">
              ✓ Film generated — key frames + video clips on canvas
            </div>
          )}
        </>
      )}
    </div>
  );
}
