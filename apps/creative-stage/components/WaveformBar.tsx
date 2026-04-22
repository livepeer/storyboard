"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface WaveformBarProps {
  /** Audio URL or blob URL to visualize */
  audioUrl: string | null;
  /** Detected BPM (shown as badge) */
  bpm: number | null;
  /** Whether the performance is currently playing */
  isPlaying: boolean;
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration in seconds */
  totalDuration: number;
  /** Called when user seeks on the waveform */
  onSeek?: (time: number) => void;
  /** Called when user clicks "Sync" to enable beat-sync modulation */
  onSync?: (bpm: number) => void;
  /** Called when user toggles play/pause */
  onTogglePlay?: () => void;
  /** Whether audio is currently paused (distinct from performance isPlaying) */
  audioPaused?: boolean;
  /** The prompt used to generate the current music */
  musicPrompt?: string | null;
  /** Called when user edits prompt and clicks regenerate */
  onRegenerate?: (newPrompt: string) => void;
  /** Whether music is currently regenerating */
  regenerating?: boolean;
}

export function WaveformBar({
  audioUrl, bpm, isPlaying, currentTime, totalDuration, onSeek, onSync,
  onTogglePlay, audioPaused, musicPrompt, onRegenerate, regenerating,
}: WaveformBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformData = useRef<Float32Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load and analyze audio waveform
  useEffect(() => {
    if (!audioUrl) {
      waveformData.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const resp = await fetch(audioUrl);
        const buf = await resp.arrayBuffer();
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;

        // Downsample to ~200 bars
        const raw = decoded.getChannelData(0);
        const bars = 200;
        const blockSize = Math.floor(raw.length / bars);
        const samples = new Float32Array(bars);

        for (let i = 0; i < bars; i++) {
          let sum = 0;
          const start = i * blockSize;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(raw[start + j] || 0);
          }
          samples[i] = sum / blockSize;
        }

        // Normalize
        const max = Math.max(...samples) || 1;
        for (let i = 0; i < bars; i++) samples[i] /= max;

        waveformData.current = samples;
      } catch {
        waveformData.current = null;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [audioUrl]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!waveformData.current) {
      // Empty state
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const bars = waveformData.current;
    const barWidth = w / bars.length;
    const progress = totalDuration > 0 ? currentTime / totalDuration : 0;
    const progressBar = Math.floor(progress * bars.length);

    for (let i = 0; i < bars.length; i++) {
      const barH = Math.max(bars[i] * h * 0.8, 1);
      const y = (h - barH) / 2;
      const isPast = i <= progressBar;

      ctx.fillStyle = isPast
        ? "rgba(99, 102, 241, 0.7)"   // indigo for played portion
        : "rgba(255, 255, 255, 0.12)"; // dim for unplayed

      ctx.fillRect(i * barWidth + 0.5, y, barWidth - 1, barH);
    }

    // Playhead line
    if (isPlaying && totalDuration > 0) {
      const x = progress * w;
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }, [audioUrl, currentTime, totalDuration, isPlaying, loading]);

  // Seek on click
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || totalDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(pct * totalDuration);
  }, [onSeek, totalDuration]);

  if (!audioUrl) return null;

  return (
    <div style={{
      position: "absolute", bottom: 100, left: 0, right: 360,
      height: 40, background: "rgba(0,0,0,0.5)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
    }}>
      {/* BPM badge */}
      {bpm && (
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#6366f1",
          background: "rgba(99,102,241,0.15)", borderRadius: 4,
          padding: "2px 6px", flexShrink: 0,
        }}>
          {bpm} BPM
        </div>
      )}

      {/* Play/Pause button */}
      {onTogglePlay && (
        <button
          onClick={onTogglePlay}
          style={{
            width: 28, height: 28, borderRadius: "50%",
            background: audioPaused ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e2e8f0", cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, lineHeight: 1, padding: 0,
          }}
          title={audioPaused ? "Play" : "Pause"}
        >
          {audioPaused ? "\u25B6" : "\u23F8"}
        </button>
      )}

      {/* Music prompt label — click to edit */}
      {musicPrompt && onRegenerate && !editing && (
        <button
          onClick={() => { setEditText(musicPrompt); setEditing(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          style={{
            fontSize: 10, color: "#888", background: "none", border: "none",
            cursor: "pointer", flexShrink: 1, minWidth: 0, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160,
            padding: "2px 4px", borderRadius: 3,
          }}
          title="Click to edit music prompt"
        >
          {regenerating ? "Regenerating…" : `♪ ${musicPrompt.slice(0, 30)}${musicPrompt.length > 30 ? "…" : ""}`}
        </button>
      )}

      {/* Inline edit form */}
      {editing && onRegenerate && (
        <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editText.trim()) {
                onRegenerate(editText.trim());
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            style={{
              flex: 1, fontSize: 11, background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(99,102,241,0.3)", borderRadius: 4,
              color: "#e2e8f0", padding: "3px 8px", outline: "none",
              minWidth: 0,
            }}
            placeholder="Describe music mood..."
          />
          <button
            onClick={() => { if (editText.trim()) { onRegenerate(editText.trim()); setEditing(false); } }}
            disabled={!editText.trim() || regenerating}
            style={{
              fontSize: 10, fontWeight: 600, color: regenerating ? "#555" : "#6366f1",
              background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 5, padding: "3px 8px", cursor: regenerating ? "default" : "pointer",
              flexShrink: 0,
            }}
          >
            {regenerating ? "…" : "Regen"}
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{
              fontSize: 10, color: "#666", background: "none", border: "none",
              cursor: "pointer", padding: "3px 4px", flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Waveform canvas — only show when not editing */}
      {!editing && (
        <canvas
          ref={canvasRef}
          width={600}
          height={32}
          onClick={handleClick}
          style={{
            flex: 1, height: 32, cursor: onSeek ? "pointer" : "default",
            borderRadius: 4,
          }}
        />
      )}

      {/* Sync button */}
      {bpm && onSync && !editing && (
        <button
          onClick={() => onSync(bpm)}
          style={{
            fontSize: 10, fontWeight: 600, color: "#22c55e",
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: 5, padding: "3px 8px", cursor: "pointer", flexShrink: 0,
          }}
          title="Sync visuals to the beat"
        >
          Sync
        </button>
      )}

      {loading && !editing && (
        <span style={{ fontSize: 10, color: "#555" }}>Analyzing…</span>
      )}
    </div>
  );
}
