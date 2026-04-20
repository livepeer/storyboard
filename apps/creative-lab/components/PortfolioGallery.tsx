"use client";

import { useProgressStore } from "../lib/stores/progress-store";
import { getMission } from "../lib/missions/catalog";

export default function PortfolioGallery() {
  const { getAllSavedCreations, progress } = useProgressStore();
  const saved = getAllSavedCreations();

  if (saved.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "4rem 2rem", gap: "1rem",
        color: "var(--text-muted)", textAlign: "center",
      }}>
        <span style={{ fontSize: "3.5rem" }}>🖼️</span>
        <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Your Gallery is Empty</p>
        <p style={{ margin: 0, fontSize: "0.9rem" }}>
          Complete missions and tap ❤️ Save on your favorite creations!
        </p>
        <a href="/" style={{
          marginTop: "0.5rem", padding: "0.6rem 1.4rem", borderRadius: "0.75rem",
          background: "var(--accent)", color: "#fff", fontWeight: 700, textDecoration: "none",
        }}>Start a Mission →</a>
      </div>
    );
  }

  return (
    <div>
      {/* Saved creations grid — BIG cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}>
        {saved.map((c) => {
          const mission = getMission(c.missionId);
          return (
            <div key={c.id} style={{
              borderRadius: 16, overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.1)",
              background: "var(--bg-card)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            }}>
              {c.type === "video" ? (
                <video src={c.url} controls loop muted playsInline style={{ width: "100%", display: "block", aspectRatio: "1", objectFit: "cover" }} />
              ) : c.type === "audio" ? (
                <div style={{ padding: 24, textAlign: "center", aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 56, marginBottom: 12 }}>🎵</div>
                  <audio src={c.url} controls style={{ width: "100%" }} />
                </div>
              ) : (
                <img src={c.url} alt="creation" style={{ width: "100%", display: "block", aspectRatio: "1", objectFit: "cover" }} />
              )}
              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>{mission?.icon || "🎨"}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {mission?.title || "Creation"}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>❤️</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mission summary below */}
      <div style={{ marginTop: 32 }}>
        <h4 style={{ color: "var(--text-dim)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
          Completed Missions
        </h4>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {progress.filter((p) => p.completed).map((p) => {
            const m = getMission(p.missionId);
            if (!m) return null;
            return (
              <a key={p.missionId} href={`/mission/${p.missionId}`} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", borderRadius: 12,
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                color: "var(--text)", textDecoration: "none", fontSize: 14,
              }}>
                <span>{m.icon}</span>
                <span style={{ fontWeight: 600 }}>{m.title}</span>
                <span>{"⭐".repeat(p.stars)}</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
