"use client";

import type { RecorderState } from "../lib/recorder";

interface RecordBarProps {
  state: RecorderState;
  isStreaming: boolean;
  onRecord: () => void;
  onStop: () => void;
  onDownload: () => void;
}

export function RecordBar({ state, isStreaming, onRecord, onStop, onDownload }: RecordBarProps) {
  if (!isStreaming && !state.blobUrl) return null;

  return (
    <div style={{
      position: "absolute", top: 12, left: 12, zIndex: 100,
      display: "flex", gap: 6, alignItems: "center",
    }}>
      {/* Record button */}
      {isStreaming && !state.isRecording && (
        <button
          onClick={onRecord}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444", borderRadius: 8, padding: "6px 12px",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
          Record
        </button>
      )}

      {/* Recording indicator + stop */}
      {state.isRecording && (
        <button
          onClick={onStop}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(239,68,68,0.25)", border: "1px solid rgba(239,68,68,0.5)",
            color: "#ef4444", borderRadius: 8, padding: "6px 12px",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
            animation: "pulse 1.5s ease infinite",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
          {formatDuration(state.duration)} — Stop
        </button>
      )}

      {/* Download button (after recording stops) */}
      {state.blobUrl && !state.isRecording && (
        <button
          onClick={onDownload}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
            color: "#22c55e", borderRadius: 8, padding: "6px 12px",
            cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}
        >
          Download ({formatDuration(state.duration)})
        </button>
      )}

      {/* Pulse animation */}
      {state.isRecording && (
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}</style>
      )}
    </div>
  );
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
