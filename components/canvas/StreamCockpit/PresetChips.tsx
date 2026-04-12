"use client";

import { SCOPE_PRESETS } from "@/lib/stream/scope-params";

interface Props {
  activePresetId?: string;
  onApply: (presetId: string) => void;
}

export function PresetChips({ activePresetId, onApply }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SCOPE_PRESETS.map((preset) => {
        const isActive = preset.id === activePresetId;
        return (
          <button
            key={preset.id}
            onClick={() => onApply(preset.id)}
            title={preset.description}
            className="rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors"
            style={{
              background: isActive ? "#ec4899" : "rgba(236,72,153,0.15)",
              color: isActive ? "#fff" : "#ec4899",
              borderColor: isActive ? "#ec4899" : "rgba(236,72,153,0.3)",
            }}
          >
            {preset.name.toLowerCase()}{isActive ? " \u25cf" : ""}
          </button>
        );
      })}
    </div>
  );
}
