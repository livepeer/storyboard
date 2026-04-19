"use client";

import { useProgressStore } from "../lib/stores/progress-store";
import { getMission } from "../lib/missions/catalog";

export default function PortfolioGallery() {
  const { progress } = useProgressStore();

  const completed = progress.filter((p) => p.completed);

  if (completed.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 2rem",
          gap: "1rem",
          color: "var(--text-muted)",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: "3.5rem" }}>🖼️</span>
        <p
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Your Gallery is Empty
        </p>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          Complete a mission to see your creations here!
        </p>
        <a
          href="/"
          style={{
            marginTop: "0.5rem",
            padding: "0.6rem 1.4rem",
            borderRadius: "0.75rem",
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 700,
            textDecoration: "none",
            fontSize: "0.95rem",
          }}
        >
          Start a Mission →
        </a>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "1rem",
      }}
    >
      {completed.map((p) => {
        const mission = getMission(p.missionId);
        if (!mission) return null;
        return (
          <GalleryCard
            key={p.missionId}
            icon={mission.icon}
            title={mission.title}
            stars={p.stars}
            maxStars={mission.maxStars}
            artifactCount={p.artifacts.length}
          />
        );
      })}
    </div>
  );
}

function GalleryCard({
  icon,
  title,
  stars,
  maxStars,
  artifactCount,
}: {
  icon: string;
  title: string;
  stars: number;
  maxStars: number;
  artifactCount: number;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "1.1rem",
        padding: "1.25rem 1rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.6rem",
        cursor: "default",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 6px 24px rgba(0,0,0,0.18)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "none";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <span style={{ fontSize: "2.5rem" }}>{icon}</span>
      <span
        style={{
          fontWeight: 700,
          fontSize: "0.95rem",
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: "1rem", letterSpacing: "0.05em" }}>
        {Array.from({ length: maxStars }, (_, i) => (
          <span key={i} style={{ opacity: i < stars ? 1 : 0.25 }}>
            ⭐
          </span>
        ))}
      </span>
      {artifactCount > 0 && (
        <span
          style={{
            fontSize: "0.78rem",
            color: "var(--text-muted)",
          }}
        >
          {artifactCount} creation{artifactCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
