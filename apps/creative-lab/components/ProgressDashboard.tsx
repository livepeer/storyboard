"use client";

import { useProgressStore } from "../lib/stores/progress-store";
import { MISSIONS } from "../lib/missions/catalog";

export default function ProgressDashboard() {
  const { progress, totalStars } = useProgressStore();

  const completedCount = progress.filter((p) => p.completed).length;
  const totalMissions = MISSIONS.length;
  const maxStars = MISSIONS.reduce((sum, m) => sum + m.maxStars, 0);
  const creationsCount = progress.reduce((sum, p) => sum + p.artifacts.length, 0);

  return (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        padding: "1.25rem 1.5rem",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "1.25rem",
        marginBottom: "1.5rem",
      }}
    >
      <StatBox
        label="Missions Completed"
        value={`${completedCount} / ${totalMissions}`}
        icon="🏆"
      />
      <Divider />
      <StatBox
        label="Stars Earned"
        value={`⭐ ${totalStars} / ${maxStars}`}
        icon={null}
      />
      <Divider />
      <StatBox
        label="Creations"
        value={String(creationsCount)}
        icon="🎨"
      />
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string | null;
}) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div
        style={{
          fontSize: "1.4rem",
          fontWeight: 800,
          color: "var(--accent)",
          lineHeight: 1.2,
        }}
      >
        {icon && <span style={{ marginRight: "0.3rem" }}>{icon}</span>}
        {value}
      </div>
      <div
        style={{
          fontSize: "0.78rem",
          color: "var(--text-muted)",
          marginTop: "0.25rem",
          fontWeight: 500,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: "1px",
        background: "var(--border)",
        alignSelf: "stretch",
        margin: "0 0.25rem",
      }}
    />
  );
}
