"use client";

import { useState } from "react";
import { useCockpitStore } from "@/lib/stream/cockpit-store";

export function ActivityFeed() {
  const history = useCockpitStore((s) => s.history);
  const pinnedSkills = useCockpitStore((s) => s.pinnedSkills);
  const [collapsed, setCollapsed] = useState(false);

  const recent = history.slice(-5).reverse();
  if (recent.length === 0) return null;

  return (
    <div className="border-t border-white/5" style={{ background: "rgba(0,0,0,0.3)" }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-3 py-1 text-left text-[9px] uppercase tracking-wider text-white/40 hover:text-white/60"
      >
        {collapsed ? "\u25b6" : "\u25bc"} Activity ({history.length})
      </button>
      {!collapsed && (
        <div className="max-h-32 overflow-y-auto px-3 pb-2 font-mono text-[9px]">
          {recent.map((entry, i) => (
            <div key={i} className="flex items-start gap-2 py-0.5">
              <span className="text-white/30">{new Date(entry.timestamp).toLocaleTimeString().slice(0, 8)}</span>
              <span className={entry.outcome === "kept" ? "text-green-400" : "text-amber-400"}>
                {entry.outcome === "kept" ? "\u2713" : "\u21ba"}
              </span>
              <span className="flex-1 text-white/60">{entry.applied.summary}</span>
              <button
                onClick={() => useCockpitStore.getState().pinAction(entry.intent, entry.applied)}
                className="text-white/30 hover:text-amber-400"
                title="Pin this action"
              >
                &#128204;
              </button>
            </div>
          ))}
          {recent.length > 0 && pinnedSkills.length > 0 && (
            <div className="mt-2 border-t border-white/5 pt-1 text-white/30">
              {pinnedSkills.length} pinned skill{pinnedSkills.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
