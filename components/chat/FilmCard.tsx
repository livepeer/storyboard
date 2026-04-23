"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Film, FilmShot } from "@/lib/film/types";
import { useFilmStore } from "@/lib/film/store";

/** Inline editable text — click to edit, Enter/blur to save, Esc to cancel. */
function EditableText({ value, onSave, multiline, className, style }: {
  value: string; onSave: (v: string) => void; multiline?: boolean;
  className?: string; style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span
        className={className}
        style={{ ...style, cursor: "pointer", borderBottom: "1px dashed rgba(255,255,255,0.1)" }}
        title="Click to edit"
        onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
      >
        {value}
      </span>
    );
  }

  const save = () => { if (draft.trim()) { onSave(draft.trim()); setEditing(false); } };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") cancel(); if (e.key === "Enter" && e.metaKey) save(); }}
        onBlur={save}
        rows={3}
        className="w-full resize-y rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] leading-relaxed text-[var(--text)] outline-none"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
      onBlur={save}
      className="w-full rounded border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[10px] text-[var(--text)] outline-none"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function FilmCard({ film: initialFilm }: { film: Film }) {
  const [collapsed, setCollapsed] = useState(false);

  // Read latest from store so edits are reflected
  const film = useFilmStore((s) => s.films.find((f) => f.id === initialFilm.id)) ?? initialFilm;
  const updateFilm = useFilmStore((s) => s.updateFilm);

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

  const updateShot = useCallback((shotIdx: number, patch: Partial<FilmShot>) => {
    const shots = film.shots.map((s, i) => i === shotIdx ? { ...s, ...patch } : s);
    updateFilm(film.id, { shots });
  }, [film.id, film.shots, updateFilm]);

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

  const statusColor =
    film.status === "applied" ? "text-emerald-300" : "text-amber-300";

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
            <EditableText
              value={film.title}
              onSave={(v) => updateFilm(film.id, { title: v })}
              className="font-semibold"
            />
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
          {/* Style */}
          <div className="mt-2 text-[10px] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-dim)]">Style:</span>{" "}
            <EditableText value={film.style} onSave={(v) => updateFilm(film.id, { style: v })} />
          </div>

          {/* Character lock */}
          {film.characterLock && (
            <div className="mt-1 text-[10px] text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-dim)]">Character lock:</span>{" "}
              <EditableText value={film.characterLock} onSave={(v) => updateFilm(film.id, { characterLock: v })} />
            </div>
          )}

          {/* Shots — each field editable */}
          <div className="mt-2 space-y-1.5">
            {film.shots.map((shot, idx) => (
              <div key={shot.index} className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                    Shot {shot.index} —{" "}
                    <EditableText
                      value={shot.title}
                      onSave={(v) => updateShot(idx, { title: v })}
                    />
                  </div>
                  <button type="button" onClick={() => navigator.clipboard.writeText(shot.description)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] text-[var(--text-dim)] hover:bg-white/[0.06]">
                    ⎘ copy
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[9px] text-orange-300/80">
                  <span>{getCameraEmoji(shot.camera)}</span>
                  <EditableText
                    value={shot.camera}
                    onSave={(v) => updateShot(idx, { camera: v })}
                    className="font-mono"
                  />
                  <span className="text-[var(--text-dim)]">· {shot.duration}s</span>
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                  <EditableText
                    value={shot.description}
                    onSave={(v) => updateShot(idx, { description: v })}
                    multiline
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
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
                click any text to edit in place
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
