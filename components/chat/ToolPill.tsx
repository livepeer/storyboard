"use client";

import { useState } from "react";
import type { TrackedTool } from "./ChatPanel";

const TOOL_LABELS: Record<string, string> = {
  create_media: "Media",
  inference: "Inference",
  canvas_create: "Card",
  canvas_update: "Update",
  canvas_get: "Canvas",
  canvas_remove: "Remove",
  load_skill: "Skill",
  capabilities: "Caps",
  stream_start: "Stream",
  stream_control: "Control",
  stream_stop: "Stop",
  train_lora: "Train",
};

function statusIcon(status: TrackedTool["status"]) {
  switch (status) {
    case "running":
      return (
        <span className="inline-block h-2 w-2 animate-spin rounded-full border border-yellow-400 border-t-transparent" />
      );
    case "done":
      return <span className="text-emerald-400">&#10003;</span>;
    case "error":
      return <span className="text-red-400">&#10007;</span>;
  }
}

function inputSummary(tool: TrackedTool): string | null {
  if (!tool.input) return null;
  const inp = tool.input;
  if (tool.name === "create_media") {
    const steps = inp.steps as Array<{ action: string }> | undefined;
    return steps ? `${steps.length} step${steps.length > 1 ? "s" : ""}` : null;
  }
  if (tool.name === "load_skill") return String(inp.skill_id || "");
  if (inp.prompt) return String(inp.prompt).slice(0, 30);
  return null;
}

export function ToolPill({ tool }: { tool: TrackedTool }) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[tool.name] || tool.name;
  const summary = inputSummary(tool);
  const hasDetail = !!(tool.resultSummary || summary);

  return (
    <div className="flex flex-col">
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] transition-colors ${
          tool.status === "error"
            ? "bg-red-500/10 text-red-300"
            : tool.status === "done"
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-white/[0.06] text-[var(--text-muted)]"
        } ${hasDetail ? "cursor-pointer hover:bg-white/[0.1]" : "cursor-default"}`}
      >
        {statusIcon(tool.status)}
        <span className="font-medium">{label}</span>
        {summary && tool.status === "running" && (
          <span className="text-[var(--text-dim)]">: {summary}</span>
        )}
        {tool.resultSummary && tool.status !== "running" && (
          <span className="text-[var(--text-dim)]">
            {tool.resultSummary.slice(0, 40)}
          </span>
        )}
        {hasDetail && (
          <span className="ml-auto text-[8px] text-[var(--text-dim)]">
            {expanded ? "\u25B2" : "\u25BC"}
          </span>
        )}
      </button>
      {expanded && tool.resultSummary && (
        <div className="mt-0.5 rounded bg-white/[0.03] px-2 py-1 text-[9px] text-[var(--text-dim)]">
          {tool.resultSummary}
        </div>
      )}
    </div>
  );
}
