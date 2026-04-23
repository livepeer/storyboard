"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Story, StoryScene } from "@/lib/story/types";
import { useStoryStore } from "@/lib/story/store";

interface Props {
  story: Story;
}

/** Inline editable text — click to edit, Enter to save, Esc to cancel. */
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
        className="w-full resize-y rounded border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-[10px] leading-relaxed text-[var(--text)] outline-none"
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
      className="w-full rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] text-[var(--text)] outline-none"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function StoryCard({ story: initialStory }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Read latest from store so edits are reflected
  const story = useStoryStore((s) => s.stories.find((x) => x.id === initialStory.id)) ?? initialStory;
  const updateStory = useStoryStore((s) => s.updateStory);

  const applyNow = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("chat-prefill", {
        detail: { text: `/story apply ${story.id}`, autoSend: true },
      })
    );
  }, [story.id]);

  const regenerate = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("chat-prefill", {
        detail: { text: `/story ${story.originalPrompt}` },
      })
    );
  }, [story.originalPrompt]);

  const copyScene = useCallback((idx: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1200);
    });
  }, []);

  const updateScene = useCallback((sceneIdx: number, patch: Partial<StoryScene>) => {
    const scenes = story.scenes.map((s, i) => i === sceneIdx ? { ...s, ...patch } : s);
    updateStory(story.id, { scenes });
  }, [story.id, story.scenes, updateStory]);

  const removeScene = useCallback((sceneIdx: number) => {
    const scenes = story.scenes.filter((_, i) => i !== sceneIdx)
      .map((s, i) => ({ ...s, index: i + 1 })); // re-index
    updateStory(story.id, { scenes });
  }, [story.id, story.scenes, updateStory]);

  const updateContext = useCallback((field: string, value: string) => {
    updateStory(story.id, { context: { ...story.context, [field]: value } });
  }, [story.id, story.context, updateStory]);

  const statusColor =
    story.status === "applied"
      ? "text-emerald-300"
      : story.status === "archived"
        ? "text-[var(--text-dim)]"
        : "text-amber-300";

  return (
    <div className="group relative max-w-[95%] self-start break-words rounded-xl border border-purple-500/25 bg-purple-500/[0.06] p-3 text-xs text-[var(--text)]">
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="text-base leading-none">📖</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <EditableText
              value={story.title}
              onSave={(v) => updateStory(story.id, { title: v })}
              className="font-semibold text-[var(--text)]"
            />
            <span className={`text-[9px] uppercase tracking-wide ${statusColor}`}>
              {story.status}
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-dim)]">
            {story.audience} · {story.scenes.length} scenes · id {story.id.slice(0, 18)}
          </div>
        </div>
        <span className="text-[10px] text-[var(--text-dim)]">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>

      {!collapsed && (
        <>
          {/* Arc */}
          {story.arc && (
            <div className="mt-2 text-[10px] italic text-[var(--text-muted)]">
              Arc: <EditableText value={story.arc} onSave={(v) => updateStory(story.id, { arc: v })} />
            </div>
          )}

          {/* Context block — each field editable */}
          <div className="mt-2 space-y-1 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2 text-[10px] text-[var(--text-muted)]">
            {story.context.style && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Style:</span>{" "}
                <EditableText value={story.context.style} onSave={(v) => updateContext("style", v)} />
              </div>
            )}
            {story.context.palette && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Palette:</span>{" "}
                <EditableText value={story.context.palette} onSave={(v) => updateContext("palette", v)} />
              </div>
            )}
            {story.context.characters && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Characters:</span>{" "}
                <EditableText value={story.context.characters} onSave={(v) => updateContext("characters", v)} />
              </div>
            )}
            {story.context.setting && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Setting:</span>{" "}
                <EditableText value={story.context.setting} onSave={(v) => updateContext("setting", v)} />
              </div>
            )}
            {story.context.mood && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Mood:</span>{" "}
                <EditableText value={story.context.mood} onSave={(v) => updateContext("mood", v)} />
              </div>
            )}
          </div>

          {/* Scenes — each title and description editable */}
          <div className="mt-2 space-y-1.5">
            {story.scenes.map((scene, idx) => (
              <div
                key={scene.index}
                className={`rounded-lg border p-2 ${
                  (scene as StoryScene & { isNew?: boolean }).isNew
                    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                    : "border-white/[0.04] bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)]">
                    Scene {scene.index} —{" "}
                    <EditableText
                      value={scene.title}
                      onSave={(v) => updateScene(idx, { title: v })}
                    />
                    {(scene as StoryScene & { isNew?: boolean }).isNew && (
                      <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[8px] font-bold text-emerald-400">NEW</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Copy scene text"
                      onClick={(e) => { e.stopPropagation(); copyScene(idx, scene.description); }}
                      className="rounded px-1.5 py-0.5 text-[9px] text-[var(--text-dim)] hover:bg-white/[0.06] hover:text-[var(--text)]"
                    >
                      {copiedIdx === idx ? "✓ copied" : "⎘ copy"}
                    </button>
                    {story.status !== "applied" && story.scenes.length > 1 && (
                      <button
                        type="button"
                        title="Remove this scene"
                        onClick={(e) => { e.stopPropagation(); removeScene(idx); }}
                        className="rounded px-1.5 py-0.5 text-[9px] text-red-400/60 hover:bg-red-500/10 hover:text-red-400"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                  <EditableText
                    value={scene.description}
                    onSave={(v) => updateScene(idx, { description: v })}
                    multiline
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          {story.status !== "applied" && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={applyNow}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25"
              >
                ✓ Apply — create canvas
              </button>
              <button
                type="button"
                onClick={regenerate}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-[var(--text-muted)] transition-colors hover:bg-white/[0.08]"
              >
                🎲 Regenerate
              </button>
              <span className="text-[9px] italic text-[var(--text-dim)]">
                click any text to edit in place
              </span>
            </div>
          )}
          {story.status === "applied" && (
            <div className="mt-3 text-[10px] italic text-emerald-400">
              ✓ Applied — scenes are on the canvas
            </div>
          )}
        </>
      )}
    </div>
  );
}
