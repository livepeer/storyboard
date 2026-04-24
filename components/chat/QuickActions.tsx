"use client";

import { useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  template: (cardTitle?: string) => string;
  /** If true, sends immediately instead of prefilling */
  autoSend?: boolean;
}

const ACTIONS: QuickAction[] = [
  {
    id: "generate",
    label: "Generate",
    icon: "+",
    template: () => "Generate an image of ",
  },
  {
    id: "restyle",
    label: "Restyle",
    icon: "\u2728",
    template: (card) =>
      card ? `Restyle "${card}" in the style of ` : "Restyle the selected card in the style of ",
  },
  {
    id: "animate",
    label: "Animate",
    icon: "\u25B6",
    template: (card) =>
      card ? `Animate "${card}" with ` : "Animate the selected card with ",
  },
  {
    id: "lv2v",
    label: "LV2V",
    icon: "\uD83D\uDCE1",
    template: (card) =>
      card
        ? `Start a live video stream from "${card}"`
        : "Start a live video stream",
  },
  {
    id: "train",
    label: "Train",
    icon: "\uD83E\uDDE0",
    template: () => "Train a LoRA model on ",
  },
];

interface Props {
  onSend: (text: string) => void;
  setInput: (text: string) => void;
  focusInput: () => void;
}

export function QuickActions({ setInput, focusInput }: Props) {
  const selectedCardIds = useCanvasStore((s) => s.selectedCardIds);
  const cards = useCanvasStore((s) => s.cards);

  const selectedCard = selectedCardIds.size === 1
    ? cards.find((c) => c.id === Array.from(selectedCardIds)[0])
    : null;

  const handleClick = (action: QuickAction) => {
    const template = action.template(selectedCard?.title);
    setInput(template);
    setTimeout(() => focusInput(), 50);
  };

  const [showRecent, setShowRecent] = useState(false);
  const recentPrompts = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("sb_prompt_history") || "[]") as string[]
    : [];

  return (
    <div className="mb-1.5">
      <div className="flex flex-wrap gap-1">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => handleClick(action)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-0.5 text-[10px] text-[var(--text-dim)] transition-colors hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-[var(--text-muted)]"
          >
            <span>{action.icon}</span>
            {action.label}
          </button>
        ))}
        {recentPrompts.length > 0 && (
          <button
            onClick={() => setShowRecent(!showRecent)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-0.5 text-[10px] text-[var(--text-dim)] transition-colors hover:border-[var(--border-hover)] hover:bg-white/[0.04] hover:text-[var(--text-muted)]"
          >
            <span>{showRecent ? "\u25B2" : "\u{1F4CB}"}</span>
            Recent
          </button>
        )}
      </div>
      {showRecent && recentPrompts.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5 max-h-24 overflow-y-auto">
          {recentPrompts.slice(0, 8).map((p, i) => (
            <button
              key={i}
              onClick={() => { setInput(p); setShowRecent(false); setTimeout(() => focusInput(), 50); }}
              className="text-left rounded px-2 py-0.5 text-[10px] text-[var(--text-dim)] hover:bg-white/[0.06] hover:text-[var(--text-muted)] truncate"
              title={p}
            >
              {p.slice(0, 60)}{p.length > 60 ? "…" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Get prompt history from localStorage. */
export function getPromptHistory(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("sb_prompt_history") || "[]"); } catch { return []; }
}

/** Save a prompt to history (call after successful generation). */
export function savePromptToHistory(prompt: string) {
  if (typeof window === "undefined" || !prompt.trim() || prompt.startsWith("/")) return;
  try {
    const history = JSON.parse(localStorage.getItem("sb_prompt_history") || "[]") as string[];
    // Remove duplicate if exists
    const filtered = history.filter((p) => p !== prompt);
    filtered.unshift(prompt);
    // Keep max 20
    localStorage.setItem("sb_prompt_history", JSON.stringify(filtered.slice(0, 20)));
  } catch { /* quota */ }
}
