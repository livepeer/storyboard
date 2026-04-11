"use client";

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

  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
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
    </div>
  );
}
