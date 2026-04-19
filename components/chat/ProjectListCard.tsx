"use client";

import { useCallback, useState } from "react";
import type { ProjectListData } from "@/lib/projects/commands";

interface Props {
  data: ProjectListData;
}

/**
 * Rich card rendered inline in the chat for /project list.
 * Project names are blue and clickable — click to copy, double-click
 * to switch to that project via chat-prefill.
 */
export function ProjectListCard({ data }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleNameClick = useCallback((id: string, name: string) => {
    navigator.clipboard.writeText(name).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    });
  }, []);

  const handleSwitch = useCallback((name: string) => {
    window.dispatchEvent(
      new CustomEvent("chat-prefill", {
        detail: { text: `/project switch ${name}`, autoSend: true },
      })
    );
  }, []);

  if (data.projects.length === 0) {
    return (
      <div className="max-w-[95%] self-start rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-[var(--text-dim)]">
        No projects yet. Generate images or use <span className="text-blue-400">/project add &lt;brief&gt;</span>
      </div>
    );
  }

  return (
    <div className="max-w-[95%] self-start rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3 text-xs text-[var(--text)]">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-blue-300">
        <span>Projects ({data.projects.length})</span>
      </div>

      <div className="space-y-1.5">
        {data.projects.map((p) => {
          const statusIcon =
            p.status === "complete" ? "✓" :
            p.status === "generating" ? "⏳" :
            p.status === "planning" ? "○" : "→";
          const progress = p.sceneCount > 0
            ? `${p.doneCount}/${p.sceneCount}`
            : "empty";

          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                p.isActive
                  ? "border-blue-500/40 bg-blue-500/10"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              <span className="text-[10px]">{statusIcon}</span>

              {/* Clickable blue project name */}
              <button
                type="button"
                onClick={() => handleNameClick(p.id, p.name)}
                onDoubleClick={() => handleSwitch(p.name)}
                className="font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                title="Click to copy · Double-click to switch"
              >
                {copiedId === p.id ? "✓ copied" : p.name}
              </button>

              <span className="flex-1 truncate text-[10px] text-[var(--text-muted)]">
                {p.brief}
              </span>

              <span className="shrink-0 text-[9px] text-[var(--text-dim)]">
                {progress} · {p.age}
              </span>

              {p.isActive && (
                <span className="shrink-0 rounded bg-blue-500/20 px-1 py-0.5 text-[8px] font-bold uppercase text-blue-300">
                  active
                </span>
              )}

              {!p.isActive && (
                <button
                  type="button"
                  onClick={() => handleSwitch(p.name)}
                  className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-[var(--text-dim)] hover:bg-white/[0.08] hover:text-[var(--text)]"
                >
                  switch
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-[9px] text-[var(--text-dim)]">
        Click name to copy · Double-click or &quot;switch&quot; to activate · <span className="text-blue-400/60">/project show &lt;name&gt;</span> for details
      </div>
    </div>
  );
}
