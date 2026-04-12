"use client";

import type { ToolCall } from "@/lib/stream/cockpit-types";

interface Props {
  applied: ToolCall | null;
  alternatives: ToolCall[];
  onRollback: () => void;
  onSwitch: (alt: ToolCall) => void;
}

const KIND_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  preset: { bg: "rgba(236,72,153,0.15)", fg: "#ec4899", border: "rgba(236,72,153,0.3)" },
  skill: { bg: "rgba(6,182,212,0.15)", fg: "#06b6d4", border: "rgba(6,182,212,0.3)" },
  param: { bg: "rgba(139,92,246,0.15)", fg: "#8b5cf6", border: "rgba(139,92,246,0.3)" },
  system: { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b", border: "rgba(245,158,11,0.3)" },
  graph: { bg: "rgba(16,185,129,0.15)", fg: "#10b981", border: "rgba(16,185,129,0.3)" },
};

export function SuggestionChips({ applied, alternatives, onRollback, onSwitch }: Props) {
  if (!applied && alternatives.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 text-[9px] uppercase tracking-wider text-white/40">Agent suggests:</div>
      <div className="flex flex-wrap gap-1.5">
        {applied && (
          <button
            onClick={onRollback}
            title="Click to rollback"
            className="rounded-full border px-2.5 py-1 text-[10px] font-medium"
            style={{
              background: "rgba(16,185,129,0.15)",
              color: "#10b981",
              borderColor: "rgba(16,185,129,0.3)",
            }}
          >
            &#x2713; {applied.summary}
          </button>
        )}
        {alternatives.map((alt, i) => {
          const color = KIND_COLORS[alt.kind] || KIND_COLORS.param;
          return (
            <button
              key={i}
              onClick={() => onSwitch(alt)}
              className="rounded-full border px-2.5 py-1 text-[10px] font-medium"
              style={{ background: color.bg, color: color.fg, borderColor: color.border }}
            >
              {alt.summary}
            </button>
          );
        })}
      </div>
    </div>
  );
}
