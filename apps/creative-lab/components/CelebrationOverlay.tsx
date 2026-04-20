"use client";

import { useEffect } from "react";

const CONFETTI_EMOJI = ["🎉", "🌟", "✨", "🎊", "💫", "🎯", "🏆"];

interface CelebrationOverlayProps {
  stars: number;
  onDone: () => void;
}

export function CelebrationOverlay({ stars, onDone }: CelebrationOverlayProps) {
  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  const particles = Array.from({ length: 20 }).map((_, i) => ({
    emoji: CONFETTI_EMOJI[i % CONFETTI_EMOJI.length],
    left: `${Math.floor((i / 20) * 100)}%`,
    delay: `${(i * 0.1).toFixed(1)}s`,
    duration: `${1.5 + (i % 5) * 0.3}s`,
  }));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        overflow: "hidden",
      }}
    >
      {/* Confetti particles */}
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: 0,
            left: p.left,
            fontSize: "1.75rem",
            animation: `confetti-fall ${p.duration} ${p.delay} ease-in forwards`,
            pointerEvents: "none",
          }}
        >
          {p.emoji}
        </span>
      ))}

      {/* Main card */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          padding: "40px 48px",
          textAlign: "center",
          maxWidth: "400px",
          position: "relative",
          zIndex: 1,
        }}
        className="animate-bounce-in"
      >
        <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🎉</div>
        <h2
          style={{
            fontSize: "2rem",
            fontWeight: 800,
            color: "var(--text)",
            marginBottom: "20px",
          }}
        >
          Amazing Work!
        </h2>

        {/* Stars */}
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "28px" }}>
          {Array.from({ length: stars }).map((_, i) => (
            <span
              key={i}
              className="animate-star-pop"
              style={{
                fontSize: "2rem",
                animationDelay: `${i * 0.15}s`,
              }}
            >
              ⭐
            </span>
          ))}
        </div>

        <button
          onClick={onDone}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "12px 32px",
            fontSize: "1rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
