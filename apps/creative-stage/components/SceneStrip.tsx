"use client";

import { useState, useRef, useCallback } from "react";
import type { Scene, PerformanceState } from "../lib/performance";

interface SceneStripProps {
  state: PerformanceState;
  onPlay: () => void;
  onStop: () => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onRemove: (idx: number) => void;
  onEditScene: (idx: number, updates: Partial<Scene>) => void;
}

const PRESET_COLORS: Record<string, string> = {
  dreamy: "#a78bfa",
  cinematic: "#fb923c",
  anime: "#f472b6",
  abstract: "#22d3ee",
  faithful: "#4ade80",
  painterly: "#fbbf24",
  psychedelic: "#fb7185",
};

export function SceneStrip({ state, onPlay, onStop, onReorder, onRemove, onEditScene }: SceneStripProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const { scenes, currentScene, isPlaying, elapsed, totalDuration } = state;

  // Progress within current scene
  let sceneElapsed = elapsed;
  for (let i = 0; i < currentScene; i++) sceneElapsed -= scenes[i]?.duration ?? 0;
  const currentDur = scenes[currentScene]?.duration ?? 1;
  const scenePct = Math.min(sceneElapsed / currentDur, 1);

  // Drag handlers
  const handleDragStart = useCallback((idx: number) => {
    if (isPlaying) return;
    setDragIdx(idx);
  }, [isPlaying]);

  const handleDragOver = useCallback((idx: number) => {
    if (dragIdx === null || dragIdx === idx) return;
    setDragOverIdx(idx);
  }, [dragIdx]);

  const handleDrop = useCallback((idx: number) => {
    if (dragIdx !== null && dragIdx !== idx) {
      onReorder(dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, onReorder]);

  if (scenes.length === 0) {
    return (
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 360,
        height: 64, background: "rgba(8,8,12,0.7)", backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#555570", fontSize: 12, fontWeight: 500,
      }}>
        No scenes — ask the agent to create a performance
      </div>
    );
  }

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 360,
      background: "rgba(8,8,12,0.8)", backdropFilter: "blur(20px) saturate(1.2)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Progress bar */}
      {isPlaying && totalDuration > 0 && (
        <div style={{ height: 2, background: "rgba(255,255,255,0.03)" }}>
          <div style={{
            height: "100%",
            background: "linear-gradient(90deg, #818cf8, #c084fc)",
            width: `${(elapsed / totalDuration) * 100}%`,
            transition: "width 0.5s linear",
            boxShadow: "0 0 8px rgba(129,140,248,0.4)",
          }} />
        </div>
      )}

      {/* Controls + scene cards */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 8 }}>
        {/* Play/Stop button */}
        <button
          onClick={isPlaying ? onStop : onPlay}
          style={{
            width: 34, height: 34, borderRadius: "50%", border: "1px solid transparent",
            background: isPlaying
              ? "rgba(248,113,113,0.15)"
              : "linear-gradient(135deg, rgba(129,140,248,0.2), rgba(192,132,252,0.15))",
            color: isPlaying ? "#f87171" : "#818cf8",
            cursor: "pointer", fontSize: 14, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 150ms ease",
            boxShadow: isPlaying ? "none" : "0 0 12px rgba(129,140,248,0.15)",
          }}
          title={isPlaying ? "Stop" : "Play"}
        >
          {isPlaying ? "■" : "▶"}
        </button>

        {/* Time display */}
        <span style={{ fontSize: 11, color: "#888", fontVariantNumeric: "tabular-nums", flexShrink: 0, width: 60, textAlign: "center" }}>
          {formatTime(elapsed)} / {formatTime(totalDuration)}
        </span>

        {/* Scene cards — horizontal scroll */}
        <div ref={stripRef} style={{
          display: "flex", gap: 6, flex: 1, overflowX: "auto", overflowY: "hidden",
          scrollbarWidth: "none", padding: "2px 0",
        }}>
          {scenes.map((scene, idx) => {
            const isCurrent = idx === currentScene && isPlaying;
            const isDragging = dragIdx === idx;
            const isDragOver = dragOverIdx === idx;
            const color = PRESET_COLORS[scene.preset] || "#6366f1";

            return (
              <div
                key={idx}
                draggable={!isPlaying}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => { e.preventDefault(); handleDragOver(idx); }}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                onClick={() => !isPlaying && setEditingIdx(editingIdx === idx ? null : idx)}
                style={{
                  position: "relative",
                  minWidth: 120, maxWidth: 180, height: 48,
                  borderRadius: 8, padding: "6px 10px",
                  background: isCurrent
                    ? `linear-gradient(135deg, ${color}33, ${color}11)`
                    : isDragOver ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isCurrent ? color + "66" : isDragOver ? "#6366f144" : "rgba(255,255,255,0.06)"}`,
                  cursor: isPlaying ? "default" : "grab",
                  opacity: isDragging ? 0.4 : 1,
                  transition: "all 0.15s ease",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {/* Scene progress overlay */}
                {isCurrent && (
                  <div style={{
                    position: "absolute", bottom: 0, left: 0,
                    height: 2, background: color, width: `${scenePct * 100}%`,
                    transition: "width 0.5s linear",
                  }} />
                )}

                {/* Scene index badge */}
                <div style={{
                  position: "absolute", top: 4, left: 6,
                  fontSize: 9, fontWeight: 700, color: color,
                  opacity: 0.7,
                }}>
                  {idx + 1}
                </div>

                {/* Remove button (only when not playing) */}
                {!isPlaying && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                    style={{
                      position: "absolute", top: 2, right: 4,
                      background: "none", border: "none", color: "#666",
                      cursor: "pointer", fontSize: 11, padding: "0 2px",
                    }}
                    title="Remove scene"
                  >
                    ×
                  </button>
                )}

                {/* Title */}
                <div style={{
                  fontSize: 11, fontWeight: 600, color: isCurrent ? "#eee" : "#bbb",
                  marginTop: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {scene.title}
                </div>

                {/* Duration + preset */}
                <div style={{ fontSize: 9, color: "#666", marginTop: 1, display: "flex", gap: 6, alignItems: "center" }}>
                  <span>{scene.duration}s</span>
                  <span style={{
                    background: color + "22", color: color, padding: "0 4px",
                    borderRadius: 3, fontSize: 8, fontWeight: 600,
                  }}>
                    {scene.preset}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline scene editor (below strip, shown when a scene is selected) */}
      {editingIdx !== null && scenes[editingIdx] && !isPlaying && (
        <SceneEditor
          scene={scenes[editingIdx]}
          onSave={(updates) => { onEditScene(editingIdx, updates); setEditingIdx(null); }}
          onCancel={() => setEditingIdx(null)}
        />
      )}
    </div>
  );
}

function SceneEditor({ scene, onSave, onCancel }: {
  scene: Scene;
  onSave: (updates: Partial<Scene>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [prompt, setPrompt] = useState(scene.prompt);
  const [preset, setPreset] = useState(scene.preset);
  const [duration, setDuration] = useState(scene.duration);

  return (
    <div style={{
      padding: "8px 12px 10px", borderTop: "1px solid rgba(255,255,255,0.05)",
      display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap",
    }}>
      <div style={{ flex: "0 0 100px" }}>
        <label style={{ fontSize: 9, color: "#666", display: "block", marginBottom: 2 }}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <label style={{ fontSize: 9, color: "#666", display: "block", marginBottom: 2 }}>Prompt</label>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ flex: "0 0 100px" }}>
        <label style={{ fontSize: 9, color: "#666", display: "block", marginBottom: 2 }}>Preset</label>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          {Object.keys(PRESET_COLORS).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div style={{ flex: "0 0 60px" }}>
        <label style={{ fontSize: 9, color: "#666", display: "block", marginBottom: 2 }}>Duration</label>
        <input type="number" min={5} max={120} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={inputStyle} />
      </div>
      <button onClick={() => onSave({ title, prompt, preset, duration })} style={btnStyle("#6366f1")}>Save</button>
      <button onClick={onCancel} style={btnStyle("#555")}>Cancel</button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)",
  color: "#e4e4f0", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box",
  transition: "border-color 150ms ease",
};

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 8, border: "1px solid transparent",
    background: bg === "#555" ? "rgba(255,255,255,0.04)" : bg + "1a",
    color: bg === "#555" ? "#8888aa" : bg,
    cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
    transition: "all 150ms ease",
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
