"use client";

import { useState, useCallback } from "react";
import type { Story } from "@/lib/story/types";

interface Props {
  story: Story;
}

/**
 * Rich card rendered inline in the chat transcript when the user runs
 * `/story <prompt>`. Shows the story metadata, creative direction,
 * and per-scene breakdown. Clicking the Apply button dispatches a
 * synthetic "apply them" message through the same chat-prefill event
 * the slash-command click buttons use — that way applying a story
 * shows up in the transcript as a user message, just like typing it
 * manually would.
 */
export function StoryCard({ story }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const applyNow = useCallback(() => {
    // chat-prefill with autoSend: true routes through the same
    // sendMessage path as typing "apply them" manually, so the
    // transcript shows the command and all the usual side effects
    // (token accounting, active request update, etc.) fire normally.
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

  const editScene = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent("chat-prefill", { detail: { text } }));
  }, []);

  const statusColor =
    story.status === "applied"
      ? "text-emerald-300"
      : story.status === "archived"
        ? "text-[var(--text-dim)]"
        : "text-amber-300";

  return (
    <div className="group relative max-w-[95%] self-start break-words rounded-xl border border-purple-500/25 bg-purple-500/[0.06] p-3 text-xs text-[var(--text)]">
      {/* Header — click to collapse */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="text-base leading-none">📖</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[var(--text)]">{story.title}</span>
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
              Arc: {story.arc}
            </div>
          )}

          {/* Context block */}
          <div className="mt-2 space-y-1 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2 text-[10px] text-[var(--text-muted)]">
            {story.context.style && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Style:</span>{" "}
                {story.context.style}
              </div>
            )}
            {story.context.palette && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Palette:</span>{" "}
                {story.context.palette}
              </div>
            )}
            {story.context.characters && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Characters:</span>{" "}
                {story.context.characters}
              </div>
            )}
            {story.context.setting && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Setting:</span>{" "}
                {story.context.setting}
              </div>
            )}
            {story.context.mood && (
              <div>
                <span className="font-semibold text-[var(--text-dim)]">Mood:</span>{" "}
                {story.context.mood}
              </div>
            )}
          </div>

          {/* Scenes */}
          <div className="mt-2 space-y-1.5">
            {story.scenes.map((scene, idx) => (
              <div
                key={scene.index}
                className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-[var(--text-muted)]">
                    Scene {scene.index} — {scene.title}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Copy scene text"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyScene(idx, scene.description);
                      }}
                      className="rounded px-1.5 py-0.5 text-[9px] text-[var(--text-dim)] hover:bg-white/[0.06] hover:text-[var(--text)]"
                    >
                      {copiedIdx === idx ? "✓ copied" : "⎘ copy"}
                    </button>
                    <button
                      type="button"
                      title="Send this scene to the chat input"
                      onClick={(e) => {
                        e.stopPropagation();
                        editScene(scene.description);
                      }}
                      className="rounded px-1.5 py-0.5 text-[9px] text-[var(--text-dim)] hover:bg-white/[0.06] hover:text-[var(--text)]"
                    >
                      ✎ edit
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
                  {scene.description}
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
                or type &ldquo;apply them&rdquo; / &ldquo;yes&rdquo;
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
