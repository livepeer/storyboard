"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Scene, PerformanceState } from "../lib/performance";

export interface SavedStreamInfo {
  title: string;
  sceneCount: number;
  streamId: string;
}

interface SceneStripProps {
  state: PerformanceState;
  onPlay: () => void;
  onStop: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onRemove: (idx: number) => void;
  onEditScene: (idx: number, updates: Partial<Scene>) => void;
  onAddScene?: (scene: Omit<Scene, "index">) => void;
  savedStreams?: SavedStreamInfo[];
  activeStreamId?: string | null;
  onSwitchStream?: (idx: number) => void;
  onRenameTab?: (idx: number, name: string) => void;
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

const PRESETS = Object.keys(PRESET_COLORS);

export function SceneStrip({ state, onPlay, onStop, onPause, onResume, onReorder, onRemove, onEditScene, onAddScene, savedStreams, activeStreamId, onSwitchStream, onRenameTab }: SceneStripProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const { scenes, currentScene, isPlaying, elapsed, totalDuration } = state;

  // Progress within current scene
  let sceneElapsed = elapsed;
  for (let i = 0; i < currentScene; i++) sceneElapsed -= scenes[i]?.duration ?? 0;
  const currentDur = scenes[currentScene]?.duration ?? 1;
  const scenePct = Math.min(sceneElapsed / currentDur, 1);

  // A scene is "locked" if it's already played or currently playing
  const isLocked = (idx: number) => isPlaying && idx <= currentScene;

  // Drag handlers — only for unlocked scenes
  const handleDragStart = useCallback((idx: number) => {
    if (isLocked(idx)) return;
    setDragIdx(idx);
  }, [isPlaying, currentScene]);

  const handleDragOver = useCallback((idx: number) => {
    if (dragIdx === null || dragIdx === idx || isLocked(idx)) return;
    setDragOverIdx(idx);
  }, [dragIdx, isPlaying, currentScene]);

  const handleDrop = useCallback((idx: number) => {
    if (dragIdx !== null && dragIdx !== idx && !isLocked(idx)) {
      onReorder(dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }, [dragIdx, onReorder, isPlaying, currentScene]);

  if (scenes.length === 0) {
    return (
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 360,
        height: 64, background: "rgba(8,8,12,0.7)", backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        color: "#555570", fontSize: 12, fontWeight: 500,
      }}>
        <span>No scenes — ask the agent to create a performance</span>
        {onAddScene && (
          <button onClick={() => setShowAddForm(true)} style={{
            background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)",
            color: "#818cf8", borderRadius: 6, padding: "4px 10px", cursor: "pointer",
            fontSize: 11, fontWeight: 600, fontFamily: "inherit",
          }}>+ Add Scene</button>
        )}
        {showAddForm && (
          <AddSceneForm
            onAdd={(s) => { onAddScene?.(s); setShowAddForm(false); }}
            onCancel={() => setShowAddForm(false)}
          />
        )}
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

      {/* Scene set tabs — double-click to rename */}
      {savedStreams && savedStreams.length >= 2 && (
        <div style={{
          display: "flex", gap: 3, padding: "4px 12px 0",
          overflowX: "auto", scrollbarWidth: "none",
        }}>
          {savedStreams.map((s, i) => (
            <TabButton
              key={s.streamId}
              label={s.title || `Set ${i + 1}`}
              count={s.sceneCount}
              isActive={s.streamId === activeStreamId}
              onClick={() => onSwitchStream?.(i)}
              onRename={(name) => onRenameTab?.(i, name)}
            />
          ))}
        </div>
      )}

      {/* Controls + scene cards */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 8 }}>
        {/* Play / Pause / Stop controls */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {/* Play or Pause button */}
          <button
            onClick={
              !isPlaying ? onPlay :
              state.isPaused ? (onResume ?? onPlay) :
              (onPause ?? onStop)
            }
            style={{
              width: 34, height: 34, borderRadius: "50%", border: "1px solid transparent",
              background: isPlaying && !state.isPaused
                ? "rgba(250,204,21,0.15)"
                : "linear-gradient(135deg, rgba(129,140,248,0.2), rgba(192,132,252,0.15))",
              color: isPlaying && !state.isPaused ? "#facc15" : "#818cf8",
              cursor: "pointer", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 150ms ease",
              boxShadow: isPlaying ? "none" : "0 0 12px rgba(129,140,248,0.15)",
            }}
            title={!isPlaying ? "Play" : state.isPaused ? "Resume" : "Pause"}
          >
            {!isPlaying || state.isPaused ? "\u25B6" : "\u23F8"}
          </button>
          {/* Stop button — only visible when playing */}
          {isPlaying && (
            <button
              onClick={onStop}
              style={{
                width: 34, height: 34, borderRadius: "50%", border: "1px solid transparent",
                background: "rgba(248,113,113,0.15)",
                color: "#f87171", cursor: "pointer", fontSize: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 150ms ease",
              }}
              title="Stop"
            >
              ■
            </button>
          )}
        </div>

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
            const locked = isLocked(idx);
            const isDragging = dragIdx === idx;
            const isDragOver = dragOverIdx === idx;
            const color = PRESET_COLORS[scene.preset] || "#818cf8";
            const isHovered = hoverIdx === idx;

            // Width proportional to duration — visually syncs with the progress bar
            const pct = totalDuration > 0 ? (scene.duration / totalDuration) * 100 : 100 / scenes.length;

            return (
              <div
                key={`${idx}-${scene.title}`}
                draggable={!locked}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => { e.preventDefault(); handleDragOver(idx); }}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                onClick={() => !locked && setEditingIdx(editingIdx === idx ? null : idx)}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{
                  position: "relative",
                  width: `${pct}%`, minWidth: 80, height: 48,
                  borderRadius: 8, padding: "6px 10px",
                  background: isCurrent
                    ? `linear-gradient(135deg, ${color}33, ${color}11)`
                    : isDragOver ? "rgba(99,102,241,0.15)"
                    : locked ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isCurrent ? color + "66" : isDragOver ? "#6366f144" : "rgba(255,255,255,0.06)"}`,
                  cursor: locked ? "default" : "grab",
                  opacity: isDragging ? 0.4 : locked && !isCurrent ? 0.5 : 1,
                  transition: "all 0.15s ease",
                  flexShrink: 1,
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
                  fontSize: 9, fontWeight: 700, color: color, opacity: 0.7,
                }}>
                  {idx + 1}
                </div>

                {/* Lock icon for past scenes */}
                {locked && !isCurrent && (
                  <div style={{ position: "absolute", top: 4, right: 6, fontSize: 8, color: "#555570" }}>✓</div>
                )}

                {/* Remove button — only for unlocked scenes */}
                {!locked && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(idx); }}
                    style={{
                      position: "absolute", top: 2, right: 4,
                      background: "none", border: "none", color: "#555570",
                      cursor: "pointer", fontSize: 11, padding: "0 2px",
                      opacity: 0.5, transition: "opacity 150ms",
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "#f87171"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; (e.target as HTMLElement).style.color = "#555570"; }}
                    title="Remove scene"
                  >
                    ×
                  </button>
                )}

                {/* Title */}
                <div style={{
                  fontSize: 11, fontWeight: 600, color: isCurrent ? "#eee" : locked ? "#777" : "#bbb",
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

                {/* Hover tooltip */}
                {isHovered && (
                  <Tooltip scene={scene} idx={idx} locked={locked} isCurrent={isCurrent} />
                )}
              </div>
            );
          })}

          {/* Add Scene button (always visible) */}
          {onAddScene && (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                minWidth: 40, height: 48, borderRadius: 8,
                border: "1px dashed rgba(129,140,248,0.3)",
                background: "transparent", color: "#818cf8",
                cursor: "pointer", fontSize: 18, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 150ms ease",
                opacity: 0.5,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
              title="Add scene"
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Inline scene editor */}
      {editingIdx !== null && scenes[editingIdx] && !isLocked(editingIdx) && (
        <SceneEditor
          key={editingIdx}
          scene={scenes[editingIdx]}
          onSave={(updates) => { onEditScene(editingIdx, updates); setEditingIdx(null); }}
          onCancel={() => setEditingIdx(null)}
        />
      )}

      {/* Add scene form */}
      {showAddForm && (
        <AddSceneForm
          onAdd={(s) => { onAddScene?.(s); setShowAddForm(false); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

// ─── Tooltip ───
function Tooltip({ scene, idx, locked, isCurrent }: { scene: Scene; idx: number; locked: boolean; isCurrent: boolean }) {
  return (
    <div style={{
      position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
      width: 220, padding: "10px 12px", borderRadius: 10,
      background: "rgba(16,16,22,0.95)", backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      animation: "fadeIn 0.15s ease-out", zIndex: 100, pointerEvents: "none",
    }}>
      {/* Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
          background: isCurrent ? "rgba(74,222,128,0.15)" : locked ? "rgba(255,255,255,0.05)" : "rgba(129,140,248,0.1)",
          color: isCurrent ? "#4ade80" : locked ? "#666" : "#818cf8",
        }}>
          {isCurrent ? "NOW PLAYING" : locked ? "PLAYED" : "UPCOMING"}
        </span>
        <span style={{ fontSize: 9, color: "#666" }}>Scene {idx + 1}</span>
      </div>

      {/* Prompt */}
      <div style={{ fontSize: 11, color: "#ccc", lineHeight: 1.4, marginBottom: 6 }}>
        {scene.prompt}
      </div>

      {/* Config row */}
      <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#888", flexWrap: "wrap" }}>
        <span>🎨 {scene.preset}</span>
        <span>⏱ {scene.duration}s</span>
        {scene.noiseScale !== undefined && <span>🎚 noise {scene.noiseScale}</span>}
        {scene.vaceRef ? (
          <span style={{ color: "#4ade80" }}>✦ VACE</span>
        ) : (
          <span style={{ color: "#555570" }}>○ no VACE</span>
        )}
      </div>

      {/* Edit hint */}
      {!locked && (
        <div style={{ fontSize: 9, color: "#555570", marginTop: 6, fontStyle: "italic" }}>
          Click to edit
        </div>
      )}

      {/* Arrow */}
      <div style={{
        position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%) rotate(45deg)",
        width: 10, height: 10, background: "rgba(16,16,22,0.95)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }} />
    </div>
  );
}

// ─── Scene Editor ───
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
      animation: "slideUp 0.2s ease-out",
    }}>
      <div style={{ flex: "0 0 100px" }}>
        <label style={labelStyle}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <label style={labelStyle}>Prompt</label>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} style={inputStyle} />
      </div>
      <div style={{ flex: "0 0 100px" }}>
        <label style={labelStyle}>Preset</label>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div style={{ flex: "0 0 60px" }}>
        <label style={labelStyle}>Duration</label>
        <input type="number" min={5} max={120} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={inputStyle} />
      </div>
      <button onClick={() => onSave({ title, prompt, preset, duration })} style={btnStyle("#818cf8")}>Save</button>
      <button onClick={onCancel} style={btnStyle("#555")}>Cancel</button>
    </div>
  );
}

// ─── Add Scene Form ───
function AddSceneForm({ onAdd, onCancel }: {
  onAdd: (scene: Omit<Scene, "index">) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState("cinematic");
  const [duration, setDuration] = useState(30);

  return (
    <div style={{
      padding: "8px 12px 10px", borderTop: "1px solid rgba(129,140,248,0.15)",
      display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap",
      animation: "slideUp 0.2s ease-out",
    }}>
      <div style={{ flex: "0 0 100px" }}>
        <label style={labelStyle}>Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scene name" style={inputStyle} />
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <label style={labelStyle}>Prompt</label>
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the visual scene…" style={inputStyle} />
      </div>
      <div style={{ flex: "0 0 100px" }}>
        <label style={labelStyle}>Preset</label>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div style={{ flex: "0 0 60px" }}>
        <label style={labelStyle}>Duration</label>
        <input type="number" min={5} max={120} value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={inputStyle} />
      </div>
      <button
        onClick={() => {
          if (!prompt) return;
          const finalTitle = title || prompt.split(/[,.]/).at(0)?.trim().slice(0, 20) || "New Scene";
          onAdd({ title: finalTitle, prompt, preset, duration });
        }}
        style={btnStyle("#4ade80")}
        disabled={!prompt}
      >Add</button>
      <button onClick={onCancel} style={btnStyle("#555")}>Cancel</button>
    </div>
  );
}

// ─── Shared styles ───
const labelStyle: React.CSSProperties = {
  fontSize: 9, color: "#666", display: "block", marginBottom: 2,
  textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)",
  color: "#e4e4f0", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box",
  transition: "border-color 150ms ease",
};

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "6px 14px", borderRadius: 8, border: "1px solid transparent",
    background: color === "#555" ? "rgba(255,255,255,0.04)" : color + "1a",
    color: color === "#555" ? "#8888aa" : color,
    cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
    transition: "all 150ms ease",
  };
}

// ─── Tab Button (double-click to rename) ───
function TabButton({ label, count, isActive, onClick, onRename }: {
  label: string; count: number; isActive: boolean;
  onClick: () => void; onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft.trim()) onRename(draft.trim()); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { if (draft.trim()) onRename(draft.trim()); setEditing(false); }
          if (e.key === "Escape") { setDraft(label); setEditing(false); }
        }}
        style={{
          padding: "2px 8px", borderRadius: "6px 6px 0 0",
          border: "1px solid rgba(129,140,248,0.4)", borderBottom: "none",
          background: "rgba(129,140,248,0.15)", color: "#e4e4f0",
          fontSize: 10, fontWeight: 600, fontFamily: "inherit",
          width: 100, outline: "none",
        }}
      />
    );
  }

  return (
    <button
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(label); setEditing(true); }}
      title="Double-click to rename"
      style={{
        padding: "3px 10px", borderRadius: "6px 6px 0 0",
        border: `1px solid ${isActive ? "rgba(129,140,248,0.3)" : "rgba(255,255,255,0.04)"}`,
        borderBottom: "none",
        background: isActive ? "rgba(129,140,248,0.12)" : "transparent",
        color: isActive ? "#a5b4fc" : "#555570",
        fontSize: 10, fontWeight: 600, fontFamily: "inherit",
        cursor: "pointer", transition: "all 150ms",
        whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: isActive ? "#4ade80" : "#333", marginRight: 5, verticalAlign: "middle" }} />
      {label.slice(0, 20)} · {count}
    </button>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
