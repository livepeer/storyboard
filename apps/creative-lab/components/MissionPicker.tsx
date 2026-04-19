"use client";

import { useRouter } from "next/navigation";
import { MISSIONS } from "../lib/missions/catalog";
import { useProgressStore } from "../lib/stores/progress-store";
import { MissionCard } from "./MissionCard";

export function MissionPicker() {
  const router = useRouter();
  const { totalStars, getProgress, isMissionUnlocked } = useProgressStore();

  function handleStart(id: string) {
    router.push(`/mission/${id}`);
  }

  return (
    <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 16px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text)", marginBottom: "8px" }}>
          Pick a Mission! 🚀
        </h1>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <span style={{ fontSize: "1.25rem" }}>⭐</span>
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--star)" }}>
            {totalStars} stars earned
          </span>
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "20px",
        }}
      >
        {MISSIONS.map((mission) => {
          const progress = getProgress(mission.id);
          const stars = progress?.stars ?? 0;
          const locked = !isMissionUnlocked(mission.id, mission.unlockAfter);
          return (
            <MissionCard
              key={mission.id}
              mission={mission}
              stars={stars}
              locked={locked}
              onStart={handleStart}
            />
          );
        })}
      </div>
    </div>
  );
}
