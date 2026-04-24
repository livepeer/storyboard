"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * PromptEditor — multi-line prompt input dialog.
 *
 * Replaces window.prompt() and single-line <input> everywhere.
 * Features:
 * - Multi-line textarea with auto-resize
 * - Context-aware hints (shows what this prompt is for)
 * - Enter to submit (Shift+Enter for newline)
 * - Escape to cancel
 * - Promise-based API: await promptEditor("Title", "placeholder") → string | null
 */

export interface PromptEditorState {
  title: string;
  placeholder: string;
  value: string;
  /** Optional context shown below title */
  context?: string;
  resolve: (value: string | null) => void;
}

interface PromptEditorProps {
  state: PromptEditorState;
  onClose: () => void;
}

export function PromptEditor({ state, onClose }: PromptEditorProps) {
  const [value, setValue] = useState(state.value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus and auto-resize
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      autoResize(ta);
    }
  }, []);

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      state.resolve(trimmed);
      onClose();
    }
  }, [value, state, onClose]);

  const cancel = useCallback(() => {
    state.resolve(null);
    onClose();
  }, [state, onClose]);

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-start justify-center pt-[18vh]"
      onClick={cancel}
    >
      <div
        className="w-[400px] rounded-2xl border border-[var(--border)] bg-[rgba(22,22,22,0.98)] p-4 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="text-sm font-semibold text-[var(--text)]">{state.title}</div>

        {/* Context hint */}
        {state.context && (
          <div className="mt-1 text-[10px] text-[var(--text-dim)] leading-relaxed">
            {state.context}
          </div>
        )}

        {/* Multi-line textarea */}
        <textarea
          ref={textareaRef}
          placeholder={state.placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autoResize(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") cancel();
          }}
          rows={3}
          className="mt-2 w-full resize-none rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-xs leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-purple-500/50"
          style={{ minHeight: 60, maxHeight: 200 }}
        />

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[9px] text-[var(--text-dim)]">
            Enter to submit, Shift+Enter for newline
          </span>
          <div className="flex gap-2">
            <button
              onClick={cancel}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-white/[0.06]"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="rounded-lg bg-purple-500/20 px-4 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/30 disabled:opacity-40"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for using PromptEditor as a Promise-based dialog.
 *
 * Usage:
 *   const { prompt, dialogNode } = usePromptEditor();
 *   const text = await prompt("Restyle", "describe the new style...");
 *   // dialogNode must be rendered in the component tree
 */
export function usePromptEditor() {
  const [state, setState] = useState<PromptEditorState | null>(null);

  const prompt = useCallback(
    (title: string, placeholder: string, defaultValue = "", context?: string): Promise<string | null> => {
      return new Promise((resolve) => {
        setState({ title, placeholder, value: defaultValue, context, resolve });
      });
    },
    [],
  );

  const dialogNode = state ? (
    <PromptEditor state={state} onClose={() => setState(null)} />
  ) : null;

  return { prompt, dialogNode };
}
