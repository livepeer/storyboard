import React from "react";

export interface ToolPillProps {
  name: string;
  status: "running" | "done" | "error";
  summary?: string;
}

const ICONS: Record<ToolPillProps["status"], string> = {
  running: "⏳",
  done: "✓",
  error: "✗",
};

const BORDER_COLORS: Record<ToolPillProps["status"], string> = {
  running: "#3b82f6",
  done: "#22c55e",
  error: "#ef4444",
};

const TEXT_COLORS: Record<ToolPillProps["status"], string> = {
  running: "#93c5fd",
  done: "#86efac",
  error: "#fca5a5",
};

export function ToolPill({ name, status, summary }: ToolPillProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: 99,
        border: `1px solid ${BORDER_COLORS[status]}`,
        color: TEXT_COLORS[status],
        fontSize: 11,
        fontFamily: "monospace",
        background: "rgba(0,0,0,0.3)",
        whiteSpace: "nowrap",
      }}
    >
      <span>{ICONS[status]}</span>
      <span>{name}</span>
      {summary ? (
        <span style={{ opacity: 0.7, marginLeft: 2 }}>{summary}</span>
      ) : null}
    </span>
  );
}
