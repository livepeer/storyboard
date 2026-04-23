"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { StreamPlan, StreamScene } from "@/lib/stream-cmd/types";
import { useStreamStore } from "@/lib/stream-cmd/store";

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
        className="w-full resize-y rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] leading-relaxed text-[var(--text)] outline-none"
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
      className="w-full rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-[var(--text)] outline-none"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function StreamPlanCard({ plan: initialPlan }: { plan: StreamPlan }) {
  const [collapsed, setCollapsed] = useState(false);

  const plan = useStreamStore((s) => s.plans.find((p) => p.id === initialPlan.id)) ?? initialPlan;
  const updatePlan = useStreamStore((s) => s.updatePlan);

  const applyNow = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("chat-prefill", {
        detail: { text: `/stream apply ${plan.id}`, autoSend: true },
      })
    );
  }, [plan.id]);

  const updateScene = useCallback((sceneIdx: number, patch: Partial<StreamScene>) => {
    const scenes = plan.scenes.map((s, i) => i === sceneIdx ? { ...s, ...patch } : s);
    updatePlan(plan.id, { scenes });
  }, [plan.id, plan.scenes, updatePlan]);

  const removeScene = useCallback((sceneIdx: number) => {
    const scenes = plan.scenes.filter((_, i) => i !== sceneIdx)
      .map((s, i) => ({ ...s, index: i + 1 }));
    updatePlan(plan.id, { scenes });
  }, [plan.id, plan.scenes, updatePlan]);

  const totalDuration = plan.scenes.reduce((s, sc) => s + sc.duration, 0);
  const statusColor = plan.status === "streaming" ? "text-red-400" : plan.status === "done" ? "text-emerald-300" : "text-amber-300";

  return (
    <div className="group relative max-w-[95%] self-start break-words rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-3 text-xs text-[var(--text)]">
      <button type="button" onClick={() => setCollapsed(!collapsed)} className="flex w-full items-start gap-2 text-left">
        <span className="text-base leading-none">📡</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <EditableText
              value={plan.title}
              onSave={(v) => updatePlan(plan.id, { title: v })}
              className="font-semibold"
            />
            <span className={`text-[9px] uppercase tracking-wide ${statusColor}`}>{plan.status}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-dim)]">
            {plan.scenes.length} scenes · {totalDuration}s · {plan.graphTemplate}
          </div>
        </div>
        <span className="text-[10px] text-[var(--text-dim)]">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <>
          {/* Style */}
          <div className="mt-2 text-[10px] text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text-dim)]">Style:</span>{" "}
            <EditableText value={plan.style} onSave={(v) => updatePlan(plan.id, { style: v })} />
          </div>

          {/* Timeline visualization */}
          <div className="mt-2 flex items-center gap-0.5 rounded-lg bg-white/[0.03] p-1.5">
            {plan.scenes.map((scene, i) => {
              const widthPct = (scene.duration / totalDuration) * 100;
              const colors = ["bg-cyan-500/40", "bg-blue-500/40", "bg-purple-500/40", "bg-pink-500/40", "bg-amber-500/40", "bg-emerald-500/40"];
              return (
                <div
                  key={scene.index}
                  className={`${colors[i % colors.length]} rounded px-1 py-0.5 text-center text-[8px] text-white/80`}
                  style={{ width: `${widthPct}%`, minWidth: "30px" }}
                  title={`${scene.title}: ${scene.duration}s`}
                >
                  {i + 1}
                </div>
              );
            })}
          </div>

          {/* Scene list — editable */}
          <div className="mt-2 space-y-1.5">
            {plan.scenes.map((scene, i) => {
              const startTime = plan.scenes.slice(0, i).reduce((s, x) => s + x.duration, 0);
              return (
                <div key={scene.index} className={`rounded-lg border p-2 ${
                  (scene as StreamScene & { isNew?: boolean }).isNew
                    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                    : "border-white/[0.04] bg-white/[0.02]"
                }`}>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 font-semibold text-[var(--text-muted)]">
                      Scene {scene.index} —{" "}
                      <EditableText
                        value={scene.title}
                        onSave={(v) => updateScene(i, { title: v })}
                      />
                      {(scene as StreamScene & { isNew?: boolean }).isNew && (
                        <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[8px] font-bold text-emerald-400">NEW</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[var(--text-dim)]">[{startTime}s → {startTime + scene.duration}s]</span>
                      {plan.status === "draft" && plan.scenes.length > 1 && (
                        <button type="button" title="Remove this scene"
                          onClick={(e) => { e.stopPropagation(); removeScene(i); }}
                          className="rounded px-1.5 py-0.5 text-[9px] text-red-400/60 hover:bg-red-500/10 hover:text-red-400">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-cyan-300/80">
                    <EditableText
                      value={scene.preset}
                      onSave={(v) => updateScene(i, { preset: v })}
                      className="font-mono"
                    />
                    <span className="text-[var(--text-dim)]">·</span>
                    <EditableText
                      value={String(scene.duration)}
                      onSave={(v) => { const n = parseInt(v); if (n > 0) updateScene(i, { duration: n }); }}
                      className="font-mono"
                    />
                    <span className="text-[var(--text-dim)]">s</span>
                  </div>
                  <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                    <EditableText
                      value={scene.prompt}
                      onSave={(v) => updateScene(i, { prompt: v })}
                      multiline
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {plan.status === "draft" && (
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={applyNow}
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25">
                📡 Start Stream
              </button>
              <span className="text-[9px] italic text-[var(--text-dim)]">
                click any text to edit · ✕ to remove scenes
              </span>
            </div>
          )}
          {plan.status === "streaming" && (
            <div className="mt-3 text-[10px] font-semibold text-red-400 animate-pulse">
              🔴 Live — scenes transitioning automatically
            </div>
          )}
          {plan.status === "done" && (
            <div className="mt-3 text-[10px] italic text-emerald-400">✓ Stream completed</div>
          )}
        </>
      )}
    </div>
  );
}
