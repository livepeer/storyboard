"use client";

import { useState, useCallback } from "react";
import type { StreamPlan } from "@/lib/stream-cmd/types";

export function StreamPlanCard({ plan }: { plan: StreamPlan }) {
  const [collapsed, setCollapsed] = useState(false);

  const applyNow = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("chat-prefill", {
        detail: { text: `/stream apply ${plan.id}`, autoSend: true },
      })
    );
  }, [plan.id]);

  const totalDuration = plan.scenes.reduce((s, sc) => s + sc.duration, 0);
  const statusColor = plan.status === "streaming" ? "text-red-400" : plan.status === "done" ? "text-emerald-300" : "text-amber-300";

  return (
    <div className="group relative max-w-[95%] self-start break-words rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-3 text-xs text-[var(--text)]">
      <button type="button" onClick={() => setCollapsed(!collapsed)} className="flex w-full items-start gap-2 text-left">
        <span className="text-base leading-none">📡</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{plan.title}</span>
            <span className={`text-[9px] uppercase tracking-wide ${statusColor}`}>{plan.status}</span>
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--text-dim)]">
            {plan.scenes.length} scenes · {totalDuration}s · {plan.graphTemplate} · {plan.style}
          </div>
        </div>
        <span className="text-[10px] text-[var(--text-dim)]">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <>
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

          {/* Scene list */}
          <div className="mt-2 space-y-1.5">
            {plan.scenes.map((scene, i) => {
              const startTime = plan.scenes.slice(0, i).reduce((s, x) => s + x.duration, 0);
              return (
                <div key={scene.index} className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-[var(--text-muted)]">
                      Scene {scene.index} — {scene.title}
                    </span>
                    <span className="text-[var(--text-dim)]">[{startTime}s → {startTime + scene.duration}s]</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-cyan-300/80">
                    <span className="font-mono">{scene.preset}</span>
                    {scene.noiseScale !== undefined && <span>noise={scene.noiseScale}</span>}
                    <span className="text-[var(--text-dim)]">· {scene.duration}s</span>
                  </div>
                  <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{scene.prompt}</div>
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
              <span className="text-[9px] italic text-[var(--text-dim)]">or type &ldquo;start streaming&rdquo;</span>
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
