"use client";

import { useState } from "react";
import type { MissionStep, StyleOption } from "../lib/missions/types";

interface Props {
  step: MissionStep;
  stepNumber: number;
  totalSteps: number;
  onSubmit: (input: string) => void;
  onSkip?: () => void;
  isLoading?: boolean;
  lastArtifactUrl?: string;
}

export function StepGuide({ step, stepNumber, totalSteps, onSubmit, onSkip, isLoading, lastArtifactUrl }: Props) {
  const [input, setInput] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleOption | null>(null);

  const skipBtn = onSkip && (
    <button onClick={onSkip} style={{
      background: "none", border: "none", color: "var(--text-dim)",
      cursor: "pointer", fontSize: 13, marginTop: 12, display: "block",
    }}>Skip this step →</button>
  );

  const dots = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === stepNumber ? 14 : 10,
            height: i === stepNumber ? 14 : 10,
            borderRadius: "50%",
            background: i < stepNumber ? "var(--success)" : i === stepNumber ? "var(--accent)" : "rgba(255,255,255,0.15)",
            transition: "all 0.3s",
          }}
        />
      ))}
      <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 8 }}>
        Step {stepNumber + 1} of {totalSteps}
      </span>
    </div>
  );

  const title = (
    <h3 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "12px 0" }}>
      {step.instruction}
    </h3>
  );

  const hintBlock = step.hint && (
    <div style={{ marginBottom: 12 }}>
      {showHint ? (
        <div style={{
          background: "rgba(249,166,2,0.1)", border: "1px solid rgba(249,166,2,0.25)",
          borderRadius: 12, padding: "12px 16px", fontSize: 14, color: "#fbbf24",
        }}>
          💡 {step.hint}
        </div>
      ) : (
        <button onClick={() => setShowHint(true)} style={{
          background: "none", border: "none", color: "var(--text-muted)",
          cursor: "pointer", fontSize: 14, textDecoration: "underline",
        }}>
          Need a hint? 💡
        </button>
      )}
    </div>
  );

  const preview = lastArtifactUrl && (
    <div style={{
      margin: "16px auto", borderRadius: 16, overflow: "hidden",
      border: "2px solid rgba(255,255,255,0.1)", maxWidth: 520,
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    }}>
      {lastArtifactUrl.includes(".mp4") || lastArtifactUrl.includes("video") ? (
        <video src={lastArtifactUrl} controls autoPlay loop muted playsInline style={{ width: "100%", display: "block" }} />
      ) : (
        <img src={lastArtifactUrl} alt="Your creation" style={{ width: "100%", display: "block" }} />
      )}
    </div>
  );

  const bigButton = (label: string, loadingLabel: string, gradient: string, shadow: string) => (
    <button
      onClick={() => onSubmit("")}
      disabled={isLoading}
      style={{
        padding: "20px 48px", borderRadius: 16, border: "none",
        background: isLoading ? "rgba(233,69,96,0.4)" : gradient,
        color: "#fff", cursor: isLoading ? "wait" : "pointer",
        fontSize: 20, fontWeight: 800, marginTop: 16,
        boxShadow: isLoading ? "none" : shadow,
        transition: "all 0.2s",
      }}
    >
      {isLoading ? loadingLabel : label}
    </button>
  );

  // ── SPARK PICK ──
  if (step.type === "spark_pick") {
    return (
      <div>
        {dots}{title}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, margin: "16px 0" }}>
          {step.sparks?.map((spark) => (
            <button
              key={spark.label}
              onClick={() => spark.prompt === "" ? undefined : onSubmit(spark.prompt)}
              disabled={isLoading}
              style={{
                padding: "18px 20px", borderRadius: 16,
                border: spark.prompt === "" ? "2px dashed rgba(233,69,96,0.4)" : "2px solid rgba(255,255,255,0.1)",
                background: spark.prompt === "" ? "rgba(233,69,96,0.08)" : "rgba(255,255,255,0.04)",
                color: "var(--text)", cursor: "pointer", fontSize: 16, fontWeight: 600,
                textAlign: "left", transition: "all 0.2s",
              }}
            >
              {spark.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && input.trim() && onSubmit(input.trim())}
            placeholder="Or type your own idea here…"
            style={{
              flex: 1, padding: "14px 18px", borderRadius: 14,
              border: "2px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
              color: "var(--text)", fontSize: 15, outline: "none",
            }}
          />
          <button onClick={() => input.trim() && onSubmit(input.trim())}
            disabled={!input.trim() || isLoading}
            style={{
              padding: "14px 24px", borderRadius: 14, border: "none",
              background: input.trim() ? "var(--accent)" : "rgba(233,69,96,0.3)",
              color: "#fff", cursor: input.trim() ? "pointer" : "not-allowed",
              fontSize: 15, fontWeight: 700,
            }}
          >Go! ✨</button>
        </div>
      </div>
    );
  }

  // ── STYLE PICK ──
  if (step.type === "style_pick") {
    return (
      <div>
        {dots}{title}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12, margin: "16px 0" }}>
          {step.styles?.map((style) => (
            <button key={style.id}
              onClick={() => { setSelectedStyle(style); onSubmit(style.promptPrefix); }}
              disabled={isLoading}
              style={{
                padding: "24px 16px", borderRadius: 16, textAlign: "center",
                border: selectedStyle?.id === style.id ? "3px solid var(--accent)" : "2px solid rgba(255,255,255,0.1)",
                background: selectedStyle?.id === style.id ? "rgba(233,69,96,0.15)" : "rgba(255,255,255,0.04)",
                color: "var(--text)", cursor: "pointer", transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 40 }}>{style.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{style.label}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── REMIX ──
  if (step.type === "remix") {
    return (
      <div>
        {dots}{title}{hintBlock}{preview}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" }}>
          {Array.from({ length: step.remixCount || 3 }).map((_, i) => (
            <button key={i} onClick={() => onSubmit(`remix-${i}`)} disabled={isLoading}
              style={{
                padding: "16px 28px", borderRadius: 14,
                border: "2px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
                color: "var(--text)", cursor: "pointer", fontSize: 16, fontWeight: 600,
                transition: "all 0.2s",
              }}
            >
              🎲 Remix #{i + 1}
            </button>
          ))}
        </div>
        <button onClick={() => onSubmit("skip-remix")} style={{
          background: "none", border: "none", color: "var(--text-muted)",
          cursor: "pointer", fontSize: 14, marginTop: 8,
        }}>
          Skip → keep this one
        </button>
      </div>
    );
  }

  // ── GENERATE / STORY_GEN / FILM_GEN ──
  if (step.type === "generate" || step.type === "story_gen" || step.type === "film_gen") {
    const labels: Record<string, [string, string]> = {
      generate: ["Make it! 🎨", "Creating… ✨"],
      story_gen: ["Create My Story! 📖", "Writing & illustrating… ✨"],
      film_gen: ["Direct My Film! 🎬", "Filming… 🎬"],
    };
    const [btn, loading] = labels[step.type] || labels.generate;
    return (
      <div>
        {dots}{title}{hintBlock}
        {bigButton(btn, loading, "linear-gradient(135deg, var(--accent), #ff6b81)", "0 4px 24px rgba(233,69,96,0.4)")}
      </div>
    );
  }

  // ── ANIMATE ──
  if (step.type === "animate") {
    return (
      <div>
        {dots}{title}{hintBlock}{preview}
        {bigButton("Bring it to Life! 🎬", "Animating… 🎬", "linear-gradient(135deg, #6366f1, #8b5cf6)", "0 4px 24px rgba(99,102,241,0.4)")}
        {skipBtn}
      </div>
    );
  }

  // ── NARRATE ──
  if (step.type === "narrate") {
    return (
      <div>
        {dots}{title}{hintBlock}{preview}
        <textarea value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Type what your character says…" rows={3}
          style={{
            width: "100%", padding: "14px 18px", borderRadius: 14, marginTop: 12,
            border: "2px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
            color: "var(--text)", fontSize: 15, outline: "none", resize: "none", fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        <button onClick={() => input.trim() && onSubmit(input.trim())}
          disabled={!input.trim() || isLoading}
          style={{
            padding: "16px 40px", borderRadius: 14, border: "none",
            background: input.trim() && !isLoading ? "linear-gradient(135deg, #f59e0b, #f97316)" : "rgba(245,158,11,0.3)",
            color: "#fff", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
            fontSize: 18, fontWeight: 700, marginTop: 12,
            boxShadow: input.trim() ? "0 4px 24px rgba(245,158,11,0.3)" : "none",
          }}
        >{isLoading ? "Recording… 🎤" : "Make Them Talk! 🗣️"}</button>
        {skipBtn}
      </div>
    );
  }

  // ── TEXT_INPUT / TRANSFORM ──
  if (step.type === "text_input" || step.type === "transform") {
    return (
      <div>
        {dots}{title}{hintBlock}{preview}
        {step.sparks && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
            {step.sparks.map((s) => (
              <button key={s.label} onClick={() => s.prompt ? onSubmit(s.prompt) : undefined}
                style={{
                  padding: "10px 16px", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
                  color: "var(--text)", cursor: "pointer", fontSize: 14, fontWeight: 500,
                }}
              >{s.label}</button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && input.trim() && onSubmit(input.trim())}
            placeholder="Describe what you want…"
            style={{
              flex: 1, padding: "14px 18px", borderRadius: 14,
              border: "2px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
              color: "var(--text)", fontSize: 15, outline: "none",
            }}
          />
          <button onClick={() => input.trim() && onSubmit(input.trim())}
            disabled={!input.trim() || isLoading}
            style={{
              padding: "14px 24px", borderRadius: 14, border: "none",
              background: input.trim() && !isLoading ? "var(--accent)" : "rgba(233,69,96,0.3)",
              color: "#fff", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
              fontSize: 15, fontWeight: 700,
            }}
          >{isLoading ? "Creating…" : "Go! ✨"}</button>
        </div>
      </div>
    );
  }

  // ── REVIEW ──
  if (step.type === "review") {
    return (
      <div>
        {dots}{title}{preview}
        <button onClick={() => onSubmit("")} style={{
          padding: "16px 40px", borderRadius: 14, border: "none",
          background: "var(--success)", color: "#fff", cursor: "pointer",
          fontSize: 18, fontWeight: 700, marginTop: 16,
        }}>Looks great! Next →</button>
      </div>
    );
  }

  return null;
}
