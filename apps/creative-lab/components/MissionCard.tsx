"use client";

import type { Mission } from "../lib/missions/types";

const DIFFICULTY_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  starter: { label: "Starter", bg: "#166534", color: "#86efac" },
  explorer: { label: "Explorer", bg: "#1e3a5f", color: "#93c5fd" },
  creator: { label: "Creator", bg: "#3b0764", color: "#d8b4fe" },
  master: { label: "Master", bg: "#78350f", color: "#fcd34d" },
};

interface MissionCardProps {
  mission: Mission;
  stars: number;
  locked: boolean;
  onStart: (id: string) => void;
}

export function MissionCard({ mission, stars, locked, onStart }: MissionCardProps) {
  const diff = DIFFICULTY_STYLES[mission.difficulty] ?? DIFFICULTY_STYLES.starter;

  return (
    <button
      onClick={() => !locked && onStart(mission.id)}
      disabled={locked}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "20px",
        textAlign: "left",
        cursor: locked ? "not-allowed" : "pointer",
        opacity: locked ? 0.5 : 1,
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        width: "100%",
      }}
      onMouseEnter={(e) => {
        if (!locked) {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.4)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
      }}
    >
      {/* Icon */}
      <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>
        {locked ? "🔒" : mission.icon}
      </div>

      {/* Title */}
      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>
        {mission.title}
      </div>

      {/* Description */}
      <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.4 }}>
        {mission.description}
      </div>

      {/* Difficulty badge */}
      <span
        style={{
          display: "inline-block",
          padding: "2px 10px",
          borderRadius: "999px",
          fontSize: "0.75rem",
          fontWeight: 700,
          background: diff.bg,
          color: diff.color,
          marginBottom: "12px",
        }}
      >
        {diff.label}
      </span>

      {/* Stars */}
      <div style={{ display: "flex", gap: "4px" }}>
        {Array.from({ length: mission.maxStars }).map((_, i) => (
          <span key={i} style={{ fontSize: "1.1rem" }}>
            {i < stars ? "⭐" : "☆"}
          </span>
        ))}
      </div>
    </button>
  );
}
