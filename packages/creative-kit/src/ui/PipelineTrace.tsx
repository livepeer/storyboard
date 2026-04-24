"use client";

import React, { useState } from "react";
import type { PipelineTrace, TraceEvent } from "../agent/trace";

function StatusIcon({ status }: { status: TraceEvent["status"] }) {
  switch (status) {
    case "running":
      return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "2px solid rgba(250,204,21,0.4)", borderTopColor: "rgba(250,204,21,0.9)", animation: "spin 1s linear infinite" }} />;
    case "done":
      return <span style={{ color: "rgba(34,197,94,0.8)", fontSize: 10 }}>✓</span>;
    case "error":
      return <span style={{ color: "rgba(248,113,113,0.8)", fontSize: 10 }}>✕</span>;
    case "skipped":
      return <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}>–</span>;
  }
}

function EventRow({ event }: { event: TraceEvent }) {
  const elapsed = event.elapsed_ms != null ? `${(event.elapsed_ms / 1000).toFixed(1)}s` : "…";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "2px 0",
      fontSize: 10, color: event.status === "error" ? "rgba(248,113,113,0.8)" : "rgba(255,255,255,0.5)",
    }}>
      <span style={{ width: 10, display: "flex", justifyContent: "center" }}>
        <StatusIcon status={event.status} />
      </span>
      <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 500, minWidth: 80 }}>{event.phase}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.detail}</span>
      <span style={{ color: "rgba(255,255,255,0.25)", fontFamily: "monospace", fontSize: 9, flexShrink: 0 }}>{elapsed}</span>
    </div>
  );
}

/**
 * PipelineTrace — renders a compact execution trace in the chat.
 * Expandable: shows summary line collapsed, full trace expanded.
 */
export function PipelineTraceView({ trace }: { trace: PipelineTrace }) {
  const [expanded, setExpanded] = useState(false);

  const doneCount = trace.events.filter((e) => e.status === "done").length;
  const errorCount = trace.events.filter((e) => e.status === "error").length;
  const totalSec = (trace.totalMs / 1000).toFixed(1);

  return (
    <div style={{
      maxWidth: "95%", alignSelf: "flex-start",
      borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(255,255,255,0.02)", overflow: "hidden",
    }}>
      {/* Summary bar — click to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: "6px 10px", border: "none", background: "transparent",
          color: "rgba(255,255,255,0.4)", fontSize: 10, cursor: "pointer",
          textAlign: "left", fontFamily: "inherit",
        }}
      >
        {trace.active ? (
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", border: "2px solid rgba(99,102,241,0.3)", borderTopColor: "rgba(99,102,241,0.8)", animation: "spin 1s linear infinite" }} />
        ) : (
          <span style={{ color: errorCount > 0 ? "rgba(248,113,113,0.6)" : "rgba(34,197,94,0.6)", fontSize: 10 }}>
            {errorCount > 0 ? "⚠" : "✓"}
          </span>
        )}
        <span style={{ color: "rgba(255,255,255,0.6)" }}>
          {trace.active ? "Running…" : `Done in ${totalSec}s`}
        </span>
        <span>·</span>
        <span>{doneCount} steps</span>
        {errorCount > 0 && <span style={{ color: "rgba(248,113,113,0.6)" }}>· {errorCount} errors</span>}
        <span style={{ marginLeft: "auto", fontSize: 8 }}>{expanded ? "▾" : "▸"}</span>
      </button>

      {/* Expanded trace */}
      {expanded && (
        <div style={{ padding: "4px 10px 8px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          {trace.events.map((event, i) => (
            <EventRow key={i} event={event} />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
